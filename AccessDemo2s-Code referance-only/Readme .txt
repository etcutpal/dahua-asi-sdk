[Introduction]
1.Demo SDK initialization,login device,logout device, control the card password, open door, query status,receive real-time information about open door function.
2.Demo how to add,delete and edit the card information, query the door status,open door mode,show receive the information.

[Interfaces]
NETClient.Init Initialize SDK
NETClient.SetDVRMessCallBack Set alarm callback
NETClient.LoginWithHighLevelSecurity Login
NETClient.Logout Logout
NETClient.GetNewDevConfig configuration get,Access control, multi-person combination to open the door, Repeat Enter Route, card time, door configuration, holiday configuration
NETClient.SetNewDevConfig configuration set,Access control, multi-person combination to open the door, Repeat Enter Route, card time, door configuration, holiday configuration
NETClient.GetDevConfig Get the time zone
NETClient.RealPlay Start real time monitor
NETClient.StopRealPlay Stop monitor
NETClient.RebootDev Reboot device
NETClient.GetDevConfig Get device time
NETClient.SetDevConfig Set device time
NETClient.ControlDevice Collect fingerprint
NETClient.StartQueryLog query log
NETClient.ControlDevice Open door, close door, 
NETClient.StartListen Start listening event
NETClient.StopListen Stop listening event
NETClient.FindRecord  Query card
NETClient.FindNextRecord Query the details of the card
NETClient.QueryDevState Get fingerprint
NETClient.FindRecordClose Close query
NETClient.InsertOperateAccessUserService   insert user info
NETClient.GetOperateAccessUserService      get user info
NETClient.RemoveOperateAccessUserService   remove user info
NETClient.ClearOperateAccessUserService    clear user info
NETClient.StartFindUserInfo  start find user info
NETClient.DoFindUserInfo  do find user info
NETClient.StopFindUserInfo stop find user info 
NETClient.InsertOperateAccessCardService   insert card 
NETClient.UpdateOperateAccessCardService   update card
NETClient.GetOperateAccessCardService      get card
NETClient.RemoveOperateAccessCardService   remove card
NETClient.ClearOperateAccessCardService    clear card
NETClient.StartFindCardInfo  start find card info 
NETClient.DoFindCardInfo     do find card info 
NETClient.StopFindCardInfo   stop find card info 
NETClient.InsertOperateAccessFingerprintService  insert Fingerprint
NETClient.GetOperateAccessFingerprintService    get Fingerprint
NETClient.RemoveOperateAccessFingerprintService remove Fingerprint
NETClient.UpdateOperateAccessFingerprintService update Fingerprint
NETClient.ClearOperateAccessFingerprintService  clear Fingerprint
NETClient.OperateAccessFaceService the operation function of face info,insert,get,update,remove,clear
NETClient.Cleanup Release SDK resources

[Notice]
When the compiling environment is VS2010, NETSDKCS library can support the version of .NET Framework 4.0 or newer. If you want to use the version older than .NET Framework 4.0, change the method of using NetSDK.cs in IntPtr.Add. We will not support the modification.
Copy all file in the libs directory of General_NetSDK_ChnEng_CSharpXX_IS_VX.XXX.XXXXXXXX.X.R.XXXXXX to the build directory of bin directory of the corresponding demo programs.


