using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using NetSDKCS;

#nullable disable

namespace NetSDKBridge.Modules
{
    /// <summary>
    /// Handles card number capture from the device's built-in or externally connected
    /// (Wiegand / RS485) card reader during employee enrollment.
    ///
    /// CAPTURE ONLY — this module does NOT write anything to the device.
    /// It parks a TaskCompletionSource and resolves it on the next
    /// ALARM_ACCESS_CTL_EVENT (0x3181) callback that contains a non-empty szCardNo.
    ///
    /// No SDK activation command is needed — the card reader is always listening.
    ///
    /// The captured card number is stored in employeeForm.cardNumbers[] on the
    /// frontend and written to the device only when the admin saves the employee
    /// record (via the existing AddPersonToDeviceViaSdk / InsertOperateAccessCardService path).
    /// </summary>
    public class CardEnrollmentModule
    {
        private readonly ILogger<CardEnrollmentModule> _logger;

        // Only one card-read session may be in-flight at a time
        private volatile TaskCompletionSource<CardReadResult> _activeTcs;

        public CardEnrollmentModule(ILogger<CardEnrollmentModule> logger)
        {
            _logger = logger;
        }

        /// <summary>
        /// Parks a TaskCompletionSource and waits for the next card swipe event
        /// to arrive via HandleCardSwipeEvent.  No SDK command is sent to the device.
        /// Returns the card number string on success.
        /// </summary>
        public async Task<CardReadResult> StartReadAsync(
            int timeoutMs = 15000)
        {
            _logger.LogInformation($"[CARD-ENROLL] StartReadAsync — waiting for card swipe (timeout {timeoutMs} ms)");

            // Guard: only one session at a time
            if (_activeTcs != null)
            {
                _logger.LogWarning("[CARD-ENROLL] A card-read session is already in progress");
                return new CardReadResult { Success = false, ErrorCode = -3, ErrorMessage = "A card-read session is already in progress" };
            }

            var tcs = new TaskCompletionSource<CardReadResult>(TaskCreationOptions.RunContinuationsAsynchronously);
            _activeTcs = tcs;

            using var cts = new CancellationTokenSource(timeoutMs);
            using var reg = cts.Token.Register(() =>
            {
                // Only cancel if this tcs is still the active one
                if (_activeTcs == tcs)
                {
                    _activeTcs = null;
                    _logger.LogWarning("[CARD-ENROLL] Timeout — no card swiped in time");
                    tcs.TrySetResult(new CardReadResult
                    {
                        Success      = false,
                        ErrorCode    = -10,
                        ErrorMessage = "Timed out — no card was swiped"
                    });
                }
            });

            return await tcs.Task;
        }

        /// <summary>
        /// Called from SDKBridgeService.MessageCallback when lCommand == 0x3181
        /// (ALARM_ACCESS_CTL_EVENT).  If a read session is pending this resolves it;
        /// otherwise it is a pure no-op so live event streaming is unaffected.
        /// </summary>
        public void HandleCardSwipeEvent(NET_ALARM_ACCESS_CTL_EVENT_INFO info)
        {
            var tcs = _activeTcs;
            if (tcs == null)
            {
                // No enrollment session in progress — normal live event, ignore
                return;
            }

            string cardNo = info.szCardNo?.Trim() ?? "";
            _logger.LogInformation($"[CARD-ENROLL] Card swipe callback — szCardNo:'{cardNo}' szReaderID:'{info.szReaderID}' szUserID:'{info.szUserID}'");

            if (string.IsNullOrEmpty(cardNo))
            {
                // Event arrived but no card number — could be a face/fingerprint event
                // Don't resolve yet; wait for one that actually has a card number
                _logger.LogDebug("[CARD-ENROLL] Event had empty szCardNo — ignoring, still waiting...");
                return;
            }

            // Clear session before resolving to avoid race conditions
            _activeTcs = null;

            tcs.TrySetResult(new CardReadResult
            {
                Success    = true,
                CardNumber = cardNo,
                ReaderID   = info.szReaderID?.Trim() ?? "",
                ErrorCode  = 0,
                ErrorMessage = "Success"
            });
        }

        /// <summary>
        /// Cancels any in-progress read session (e.g. when the user closes the modal).
        /// </summary>
        public void CancelRead()
        {
            var tcs = _activeTcs;
            if (tcs != null)
            {
                _activeTcs = null;
                _logger.LogInformation("[CARD-ENROLL] Session cancelled by caller");
                tcs.TrySetResult(new CardReadResult
                {
                    Success      = false,
                    ErrorCode    = -20,
                    ErrorMessage = "Cancelled"
                });
            }
        }

        public class CardReadResult
        {
            public bool   Success      { get; set; }
            public string CardNumber   { get; set; } = "";
            public string ReaderID     { get; set; } = "";
            public int    ErrorCode    { get; set; }
            public string ErrorMessage { get; set; } = "";
        }
    }
}
