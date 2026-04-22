/****************************************************************************************************************************
 * Access Records Query Module - Query Historical Access Records from Device
 *
 * USES: NetSDK FindRecord API (TCP method via auto-registration connection)
 *
 * PURPOSE:
 * Queries access control records from device using SDK's FindRecord API.
 * Works through NAT/firewall via existing TCP auto-registration connection (port 9500).
 * No direct HTTP access to device IP required.
 *
 * ARCHITECTURE:
 * 1. Receive query request from backend (date range, device ID, filters)
 * 2. Call QueryAccessRecordsByTCP() on SDKBridgeService
 * 3. SDK uses NETClient.FindRecord() to query device
 * 4. Fetch records in batches using NETClient.FindNextRecord()
 * 5. Return structured results to backend
 * 6. Backend stores results in access-record.json
 *
 * USAGE:
 * var module = new AccessRecordsQueryModule(logger);
 * var records = await module.QueryRecords(deviceId, startTime, endTime, maxRecords);
 *
 * BASED ON:
 * - SDKBridgeService.QueryAccessRecordsBySDK() existing implementation
 * - Section 5.6 of Access Control API Guide (Access Control Card Swipe Records)
 * - NET_RECORDSET_ACCESS_CTL_CARDREC structure
 ***************************************************************************************************************************/

using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using NetSDKCS;

#nullable enable

namespace NetSDKBridge.Modules
{
    /// <summary>
    /// Module for querying historical access records from devices via SDK TCP connection
    /// </summary>
    public class AccessRecordsQueryModule
    {
        private readonly ILogger<AccessRecordsQueryModule> _logger;

        public AccessRecordsQueryModule(ILogger<AccessRecordsQueryModule> logger)
        {
            _logger = logger;
        }

        /// <summary>
        /// Query access records from device using SDK FindRecord API (TCP method)
        /// </summary>
        /// <param name="deviceId">Device ID (Registration ID)</param>
        /// <param name="loginHandle">Device login handle</param>
        /// <param name="startTime">Start time for query (optional, defaults to 7 days ago)</param>
        /// <param name="endTime">End time for query (optional, defaults to now)</param>
        /// <param name="cardNumber">Filter by card number (optional)</param>
        /// <param name="maxRecords">Maximum records to fetch (default 1000)</param>
        /// <returns>List of access records</returns>
        public async Task<List<AccessRecordQueryResult>> QueryRecords(
            string deviceId,
            IntPtr loginHandle,
            DateTime? startTime = null,
            DateTime? endTime = null,
            string? cardNumber = null,
            int maxRecords = 1000)
        {
            var results = new List<AccessRecordQueryResult>();

            try
            {
                if (loginHandle == IntPtr.Zero)
                {
                    _logger.LogWarning($"Device {deviceId} is not logged in");
                    return results;
                }

                _logger.LogInformation($"[AccessRecordsQuery] Querying records for device: {deviceId}");
                _logger.LogInformation($"   Time Range: {startTime?.ToString("yyyy-MM-dd HH:mm:ss") ?? "7 days ago"} to {endTime?.ToString("yyyy-MM-dd HH:mm:ss") ?? "Now"}");
                _logger.LogInformation($"   Max Records: {maxRecords}");
                _logger.LogInformation($"   Card Filter: {cardNumber ?? "None"}");

                // Default to last 7 days if no time range specified
                DateTime effectiveStart = startTime ?? DateTime.Now.AddDays(-7);
                DateTime effectiveEnd = endTime ?? DateTime.Now;

                var seenRecordNos = new HashSet<string>();

                // Build query condition
                var condition = new NET_FIND_RECORD_ACCESSCTLCARDREC_CONDITION_EX
                {
                    dwSize = (uint)Marshal.SizeOf(typeof(NET_FIND_RECORD_ACCESSCTLCARDREC_CONDITION_EX)),
                    bCardNoEnable = !string.IsNullOrEmpty(cardNumber),
                    szCardNo = cardNumber ?? "",
                    bTimeEnable = true,
                    bRealUTCTimeEnable = false,  // Device interprets times as-is
                    nOrderNum = 0
                };

                // Initialize orders array
                condition.stuOrders = new NET_FIND_RECORD_ACCESSCTLCARDREC_ORDER[6];

                // Set time range
                var startDate = effectiveStart;
                condition.stStartTime.dwYear = (uint)startDate.Year;
                condition.stStartTime.dwMonth = (uint)startDate.Month;
                condition.stStartTime.dwDay = (uint)startDate.Day;
                condition.stStartTime.dwHour = (uint)startDate.Hour;
                condition.stStartTime.dwMinute = (uint)startDate.Minute;
                condition.stStartTime.dwSecond = (uint)startDate.Second;

                var endDate = effectiveEnd;
                condition.stEndTime.dwYear = (uint)endDate.Year;
                condition.stEndTime.dwMonth = (uint)endDate.Month;
                condition.stEndTime.dwDay = (uint)endDate.Day;
                condition.stEndTime.dwHour = (uint)endDate.Hour;
                condition.stEndTime.dwMinute = (uint)endDate.Minute;
                condition.stEndTime.dwSecond = (uint)endDate.Second;

                // Step 1: Open FindRecord handle
                IntPtr findHandle = IntPtr.Zero;
                bool findResult = NETClient.FindRecord(
                    loginHandle,
                    EM_NET_RECORD_TYPE.ACCESSCTLCARDREC_EX,
                    condition,
                    typeof(NET_FIND_RECORD_ACCESSCTLCARDREC_CONDITION_EX),
                    ref findHandle,
                    10000
                );

                if (!findResult || findHandle == IntPtr.Zero)
                {
                    var errorCode = NETClient.GetLastError();
                    _logger.LogError($"[AccessRecordsQuery] FindRecord failed: {errorCode}");
                    return results;
                }

                _logger.LogInformation($"[AccessRecordsQuery] FindRecord handle opened: {findHandle}");

                try
                {
                    // Step 2: Get record count (optional)
                    int recordCount = 0;
                    bool countResult = NETClient.QueryRecordCount(findHandle, ref recordCount, 10000);

                    if (countResult)
                    {
                        _logger.LogInformation($"[AccessRecordsQuery] Total records found on device: {recordCount}");
                    }

                    // Step 3: Fetch records in batches
                    int totalFetched = 0;
                    int batchSize = Math.Min(100, maxRecords);

                    while (totalFetched < maxRecords)
                    {
                        int retNum = 0;
                        var recordList = new List<object>();

                        int nextResult = NETClient.FindNextRecord(
                            findHandle,
                            batchSize,
                            ref retNum,
                            ref recordList,
                            typeof(NET_RECORDSET_ACCESS_CTL_CARDREC),
                            10000
                        );

                        if (nextResult <= 0 || retNum == 0)
                        {
                            if (nextResult <= 0)
                            {
                                var fetchError = NETClient.GetLastError();
                                _logger.LogWarning($"[AccessRecordsQuery] FindNextRecord error: {fetchError}");
                            }
                            _logger.LogInformation($"[AccessRecordsQuery] No more records to fetch (fetched {totalFetched} total)");
                            break;
                        }

                        _logger.LogDebug($"[AccessRecordsQuery] Fetched {retNum} records in batch");

                        // Process each record
                        foreach (var recordObj in recordList)
                        {
                            if (totalFetched >= maxRecords) break;

                            if (recordObj is NET_RECORDSET_ACCESS_CTL_CARDREC record)
                            {
                                // Use composite key for deduplication
                                string dedupKey = $"{record.nRecNo}_{record.szCardNo}_{record.szUserID}_{record.stuTime.ToDateTime():yyyyMMddHHmmss}";
                                if (seenRecordNos.Contains(dedupKey))
                                {
                                    continue;
                                }
                                seenRecordNos.Add(dedupKey);

                                // Convert to result
                                var result = new AccessRecordQueryResult
                                {
                                    DeviceId = deviceId, // Include the device ID
                                    RecordNumber = record.nRecNo,
                                    CardNumber = record.szCardNo?.Trim() ?? "",
                                    UserID = record.szUserID?.Trim() ?? "",
                                    UserName = record.szCardName?.Trim() ?? "",  // Extract name from SDK record
                                    SwipeTime = record.stuTime.ToDateTime().ToString("yyyy-MM-ddTHH:mm:ssZ"),
                                    DoorNumber = record.nDoor,
                                    ReaderNo = record.szReaderID?.Trim() ?? "",
                                    CardType = GetCardTypeString(record.emCardType),
                                    OpenMethod = GetOpenMethodString(record.emMethod),
                                    Status = record.bStatus ? "Success" : "Failed"
                                };

                                results.Add(result);
                                totalFetched++;
                            }
                        }

                        // If we got fewer records than batch size, we're done
                        if (retNum < batchSize)
                        {
                            break;
                        }
                    }

                    _logger.LogInformation($"[AccessRecordsQuery] Total access records retrieved: {results.Count}");
                    return results;
                }
                finally
                {
                    // Step 4: Close query handle
                    if (findHandle != IntPtr.Zero)
                    {
                        NETClient.FindRecordClose(findHandle);
                        _logger.LogDebug($"[AccessRecordsQuery] FindRecord handle closed");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"[AccessRecordsQuery] Error querying records: {ex.Message}");
                return results;
            }
        }

        /// <summary>
        /// Convert card type enum to readable string
        /// </summary>
        private string GetCardTypeString(EM_A_NET_ACCESSCTLCARD_TYPE cardType)
        {
            return cardType switch
            {
                EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_GENERAL => "Normal",
                EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_VIP => "VIP",
                EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_GUEST => "Guest",
                EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_PATROL => "Patrol",
                EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_BLACKLIST => "Blacklisted",
                EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_CORCE => "Coercion",
                EM_A_NET_ACCESSCTLCARD_TYPE.NET_ACCESSCTLCARD_TYPE_UNKNOWN => "Unknown",
                _ => "Unknown"
            };
        }

        /// <summary>
        /// Convert open door method enum to readable string
        /// </summary>
        private string GetOpenMethodString(EM_ACCESS_DOOROPEN_METHOD method)
        {
            return method switch
            {
                EM_ACCESS_DOOROPEN_METHOD.PWD_ONLY => "Password",
                EM_ACCESS_DOOROPEN_METHOD.CARD => "Card",
                EM_ACCESS_DOOROPEN_METHOD.CARD_FIRST => "Card+Password",
                EM_ACCESS_DOOROPEN_METHOD.PWD_FIRST => "Password+Card",
                EM_ACCESS_DOOROPEN_METHOD.REMOTE => "Remote Unlock",
                EM_ACCESS_DOOROPEN_METHOD.BUTTON => "Button",
                EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT => "Fingerprint",
                EM_ACCESS_DOOROPEN_METHOD.PWD_CARD_FINGERPRINT => "Password+Card+Fingerprint",
                EM_ACCESS_DOOROPEN_METHOD.PWD_FINGERPRINT => "Password+Fingerprint",
                EM_ACCESS_DOOROPEN_METHOD.CARD_FINGERPRINT => "Card+Fingerprint",
                EM_ACCESS_DOOROPEN_METHOD.PERSONS => "Multi-Person",
                EM_ACCESS_DOOROPEN_METHOD.KEY => "Key",
                EM_ACCESS_DOOROPEN_METHOD.COERCE_PWD => "Coercion Password",
                EM_ACCESS_DOOROPEN_METHOD.QRCODE => "QR Code",
                EM_ACCESS_DOOROPEN_METHOD.FACE_RECOGNITION => "Face Recognition",
                EM_ACCESS_DOOROPEN_METHOD.FACEIDCARD => "Face+ID Card",
                EM_ACCESS_DOOROPEN_METHOD.FACEIDCARD_AND_IDCARD => "Face+ID Card+Card",
                EM_ACCESS_DOOROPEN_METHOD.BLUETOOTH => "Bluetooth",
                EM_ACCESS_DOOROPEN_METHOD.CUSTOM_PASSWORD => "Custom Password",
                EM_ACCESS_DOOROPEN_METHOD.USERID_AND_PWD => "UserID+Password",
                EM_ACCESS_DOOROPEN_METHOD.FACE_AND_PWD => "Face+Password",
                EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT_AND_PWD => "Fingerprint+Password",
                _ => "Unknown"
            };
        }
    }

    /// <summary>
    /// Access record query result
    /// </summary>
    public class AccessRecordQueryResult
    {
        public string DeviceId { get; set; } = "";
        public int RecordNumber { get; set; }
        public string CardNumber { get; set; } = "";
        public string UserID { get; set; } = "";
        public string UserName { get; set; } = "";  // SDK doesn't provide this
        public string SwipeTime { get; set; } = "";
        public int DoorNumber { get; set; }
        public string ReaderNo { get; set; } = "";
        public string CardType { get; set; } = "Unknown";
        public string OpenMethod { get; set; } = "Unknown";
        public string Status { get; set; } = "";  // "Success" or "Failed"
    }
}
