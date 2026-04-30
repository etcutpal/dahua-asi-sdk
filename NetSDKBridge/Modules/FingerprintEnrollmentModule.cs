using System;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using NetSDKCS;

#nullable disable

namespace NetSDKBridge.Modules
{
    /// <summary>
    /// Handles fingerprint capture via the device's built-in scanner.
    ///
    /// CAPTURE ONLY â€” this module does NOT write anything to the device.
    /// It activates the scanner, waits for the ALARM_FINGER_PRINT callback,
    /// copies the raw template bytes and returns them as base64.
    ///
    /// The template is later written to the device as part of the full
    /// "Save Employee" flow via AddPersonToDeviceAsync (SDKBridgeService),
    /// which calls InsertOperateAccessUserService + InsertOperateAccessFingerprintService.
    /// </summary>
    public class FingerprintEnrollmentModule
    {
        private readonly ILogger<FingerprintEnrollmentModule> _logger;

        // Only one capture can be in-flight at a time
        private volatile TaskCompletionSource<EnrollResult> _activeTcs;
        private volatile string _activeUserID;

        // Secondary lookup by szUserID in case the callback echoes it correctly
        private readonly ConcurrentDictionary<string, TaskCompletionSource<EnrollResult>> _pending = new();

        public FingerprintEnrollmentModule(ILogger<FingerprintEnrollmentModule> logger)
        {
            _logger = logger;
        }

        /// <summary>
        /// Activates the device built-in scanner and waits for the captured template.
        /// Returns the raw template as base64 â€” does NOT write to the device.
        /// The template should be saved and sent to the device only when the full
        /// employee record is submitted (via AddPersonToDeviceAsync).
        /// </summary>
        public async Task<EnrollResult> StartCaptureAsync(
            IntPtr loginHandle,
            int channelId,
            string readerID,
            string userID,
            int fingerSlot = 1,
            int timeoutMs = 30000)
        {
            _logger.LogInformation($"[FP-CAPTURE] StartCaptureAsync â€” UserID:{userID} Slot:{fingerSlot} Channel:{channelId} Reader:{readerID} Timeout:{timeoutMs}ms");

            var ctrl = new NET_CTRL_CAPTURE_FINGER_PRINT
            {
                dwSize     = (uint)Marshal.SizeOf<NET_CTRL_CAPTURE_FINGER_PRINT>(),
                nChannelID = channelId,
                szReaderID = readerID ?? "1",
                szUserID   = userID ?? ""
            };

            IntPtr pIn = IntPtr.Zero;
            try
            {
                pIn = Marshal.AllocHGlobal(Marshal.SizeOf<NET_CTRL_CAPTURE_FINGER_PRINT>());
                Marshal.StructureToPtr(ctrl, pIn, false);

                bool ok = NETClient.ControlDeviceEx(loginHandle, EM_CtrlType.CAPTURE_FINGER_PRINT, pIn, IntPtr.Zero, 3000);
                if (!ok)
                {
                    string sdkErr = NETClient.GetLastError();
                    _logger.LogWarning($"[FP-CAPTURE] ControlDeviceEx failed â€” {sdkErr}");
                    return new EnrollResult { Success = false, ErrorCode = -1, ErrorMessage = $"Failed to activate scanner ({sdkErr})" };
                }
                _logger.LogInformation("[FP-CAPTURE] Scanner activated â€” waiting for alarm callback...");
            }
            finally
            {
                if (pIn != IntPtr.Zero) Marshal.FreeHGlobal(pIn);
            }

            var tcs = new TaskCompletionSource<EnrollResult>(TaskCreationOptions.RunContinuationsAsynchronously);
            _activeTcs    = tcs;
            _activeUserID = userID;
            _pending[userID] = tcs;

            using var cts = new CancellationTokenSource(timeoutMs);
            using var reg = cts.Token.Register(() =>
            {
                if (_pending.TryRemove(userID, out var t))
                {
                    if (_activeTcs == t) _activeTcs = null;
                    _activeUserID = null;
                    _logger.LogWarning($"[FP-CAPTURE] Timeout â€” UserID:{userID}");
                    t.TrySetResult(new EnrollResult { Success = false, ErrorCode = -10, ErrorMessage = "Timed out â€” no finger detected in time" });
                }
            });

            return await tcs.Task;
        }

        /// <summary>
        /// Called from SDKBridgeService.MessageCallback when lCommand == ALARM_FINGER_PRINT (0x318d).
        /// Copies the template bytes and resolves the waiting task â€” no device writes.
        /// </summary>
        public void HandleFingerprintAlarm(NET_ALARM_CAPTURE_FINGER_PRINT_INFO info)
        {
            string callbackUid = info.szUserID ?? "";
            _logger.LogInformation($"[FP-CAPTURE] HandleFingerprintAlarm â€” CallbackUID:'{callbackUid}' ActiveUID:'{_activeUserID}' CollectResult:{info.bCollectResult} ErrorCode:{info.nErrorCode}");

            // Resolve TCS â€” prefer active session, fall back to uid key
            TaskCompletionSource<EnrollResult> tcs = _activeTcs;
            if (tcs == null && !string.IsNullOrEmpty(callbackUid))
                _pending.TryGetValue(callbackUid, out tcs);

            if (tcs == null)
            {
                _logger.LogDebug($"[FP-CAPTURE] No pending session for UID:'{callbackUid}' â€” ignoring");
                return;
            }

            // Clear session state before resolving
            _activeTcs = null;
            if (_activeUserID != null) _pending.TryRemove(_activeUserID, out _);
            if (!string.IsNullOrEmpty(callbackUid)) _pending.TryRemove(callbackUid, out _);
            _activeUserID = null;

            if (!info.bCollectResult)
            {
                string msg = MapErrorCode(info.nErrorCode);
                _logger.LogWarning($"[FP-CAPTURE] âŒ Device reported failure â€” Code:{info.nErrorCode} ({msg})");
                tcs.TrySetResult(new EnrollResult { Success = false, ErrorCode = info.nErrorCode, ErrorMessage = msg });
                return;
            }

            int totalLen = info.nPacketLen * info.nPacketNum;
            if (totalLen <= 0 || info.szFingerPrintInfo == IntPtr.Zero)
            {
                tcs.TrySetResult(new EnrollResult { Success = false, ErrorCode = 1, ErrorMessage = "Template data is empty" });
                return;
            }

            // Copy bytes immediately â€” callback buffer is only valid during this call
            byte[] templateBytes = new byte[totalLen];
            Marshal.Copy(info.szFingerPrintInfo, templateBytes, 0, totalLen);
            string base64 = Convert.ToBase64String(templateBytes);

            _logger.LogInformation($"[FP-CAPTURE] âœ… Template captured â€” {totalLen} bytes. Return to frontend; device write happens on employee save.");

            tcs.TrySetResult(new EnrollResult
            {
                Success        = true,
                TemplateBase64 = base64,
                PacketLen      = totalLen,
                PacketNum      = 1,
                ErrorCode      = 0,
                ErrorMessage   = "Success"
            });
        }

        private static string MapErrorCode(int code) => code switch
        {
            -10 => "Timed out â€” no finger detected in time",
            -1  => "Unknown error â€” retry",
            0   => "Success",
            1   => "General failure â€” retry",
            2   => "Collection failed â€” press finger firmly",
            3   => "Touches not consistent â€” retry",
            4   => "Internal error â€” contact support",
            5   => "Device timed out â€” press finger sooner",
            6   => "Device busy â€” wait and retry",
            7   => "This finger is already enrolled",
            8   => "Unknown error â€” retry",
            9   => "Device fingerprint storage is full",
            _   => $"Unknown error code {code}"
        };

        public class EnrollResult
        {
            public bool   Success        { get; set; }
            public string TemplateBase64 { get; set; } // base64 raw template â€” store and send on save
            public int    PacketLen      { get; set; }
            public int    PacketNum      { get; set; }
            public int    ErrorCode      { get; set; }
            public string ErrorMessage   { get; set; }
        }
    }
}
