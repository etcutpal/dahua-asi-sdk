using NetSDKCS;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace AccessDemo2s
{
    public partial class DeviceInfoForm : Form
    {
        private IntPtr m_LoginID = IntPtr.Zero;

        public DeviceInfoForm()
        {
            InitializeComponent();
        }

        public DeviceInfoForm(IntPtr loginid)
        {
            InitializeComponent();
            m_LoginID = loginid;
        }

        private void btn_Get_Click(object sender, EventArgs e)
        {
            GetVersionInfo();
            GetAccessCaps();
        }

        private void GetVersionInfo()
        {
            #region Query Version info 获取设备版本信息
            NET_DEV_VERSION_INFO VersionInfo = new NET_DEV_VERSION_INFO();
            object objInfo = VersionInfo;
            bool ret = NETClient.QueryDevState(m_LoginID, EM_DEVICE_STATE.SOFTWARE, ref objInfo, typeof(NET_DEV_VERSION_INFO), 10000);
            if (!ret)
            {
                MessageBox.Show(NETClient.GetLastError());
                return;
            }
            VersionInfo = (NET_DEV_VERSION_INFO)objInfo;

            txt_Version.Text = "SerialNo(序列号)：" + VersionInfo.szDevSerialNo + System.Environment.NewLine;
            txt_Version.Text += "SoftwareVersion(软件版本)：" + VersionInfo.szSoftWareVersion + System.Environment.NewLine;
            txt_Version.Text += "ReleaseTime(编译时间)：" + ((VersionInfo.dwSoftwareBuildDate >> 16) & 0xffff) + "-" + ((VersionInfo.dwSoftwareBuildDate >> 8) & 0xff) + "-" + (VersionInfo.dwSoftwareBuildDate & 0xff) + System.Environment.NewLine;

            // Query MAC address 获取物理地址
            NET_DEV_NETINTERFACE_INFO[] stuNetInfo = new NET_DEV_NETINTERFACE_INFO[64];

            for (int i = 0; i < 64; i++)
            {
                stuNetInfo[i].dwSize = (int)Marshal.SizeOf(stuNetInfo[i].GetType());
            }
            object[] objInfo2 = new object[64];
            for (int i = 0; i < 64; i++)
            {
                objInfo2[i] = stuNetInfo[i];
            }
            bool Macret = NETClient.QueryDevState(m_LoginID, (int)EM_DEVICE_STATE.NETINTERFACE, ref objInfo2, typeof(NET_DEV_NETINTERFACE_INFO), 5000);
            if (!Macret)
            {
                MessageBox.Show(NETClient.GetLastError());
                return;
            }
            for (int i = 0; i < objInfo2.Length; i++)
            {
                stuNetInfo[i] = (NET_DEV_NETINTERFACE_INFO)objInfo2[i];
            }
            txt_Version.Text += "MAC(物理地址)：" + stuNetInfo[0].szMAC + System.Environment.NewLine;

            // Query MCUVersion 获取单片机软件版本号
            IntPtr inSysPtr = IntPtr.Zero;
            IntPtr outSysPtr = IntPtr.Zero;
            NET_IN_SYSTEM_INFO stuSysInfo = new NET_IN_SYSTEM_INFO();
            stuSysInfo.dwSize = (uint)Marshal.SizeOf(typeof(NET_IN_SYSTEM_INFO));
            inSysPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NET_IN_SYSTEM_INFO)));
            Marshal.StructureToPtr(stuSysInfo, inSysPtr, true);

            NET_OUT_SYSTEM_INFO stuSysOut = new NET_OUT_SYSTEM_INFO();
            stuSysOut.dwSize = (uint)Marshal.SizeOf(typeof(NET_OUT_SYSTEM_INFO));
            outSysPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NET_OUT_SYSTEM_INFO)));
            Marshal.StructureToPtr(stuSysOut, outSysPtr, true);

            #endregion
        }

        private void GetAccessCaps()
        {
            NET_IN_AC_CAPS stuIn = new NET_IN_AC_CAPS();
            stuIn.dwSize = (uint)Marshal.SizeOf(typeof(NET_IN_AC_CAPS));
            NET_OUT_AC_CAPS stuOut = new NET_OUT_AC_CAPS();
            stuOut.dwSize = (uint)Marshal.SizeOf(typeof(NET_OUT_AC_CAPS));
            stuOut.stuACCaps = new NET_AC_CAPS();
            stuOut.stuUserCaps = new NET_ACCESS_USER_CAPS();
            stuOut.stuCardCaps = new NET_ACCESS_CARD_CAPS();
            stuOut.stuFingerprintCaps = new NET_ACCESS_FINGERPRINT_CAPS();
            stuOut.stuFaceCaps = new NET_ACCESS_FACE_CAPS();

            IntPtr ptrIn = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NET_IN_AC_CAPS)));
            IntPtr ptrOut = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NET_OUT_AC_CAPS)));
            Marshal.StructureToPtr(stuIn, ptrIn, true);
            Marshal.StructureToPtr(stuOut, ptrOut, true);
            bool bRet = NETClient.GetDevCaps(m_LoginID, EM_DEVCAP_TYPE.ACCESSCONTROL_CAPS, ptrIn, ptrOut, 5000);
            if (bRet)
            {
                stuOut = (NET_OUT_AC_CAPS)Marshal.PtrToStructure(ptrOut, typeof(NET_OUT_AC_CAPS));
                string strCap = "Access Control Caps(门禁能力):";

                strCap += "\r\nChannels(门禁个数):" + stuOut.stuACCaps.nChannels;
                strCap += "\r\nIsSupportAlarmRecord(是否支持门禁报警日志记录在记录集中):" + stuOut.stuACCaps.bSupAccessControlAlarmRecord;
                if (stuOut.stuACCaps.nCustomPasswordEncryption == 0)
                {
                    strCap += "\r\nPasswordEncryptionType(记录集中密码的保存方式):Plaintext(明文)";

                }
                else
                {
                    strCap += "\r\nPasswordEncryptionType(记录集中密码的保存方式):MD5(MD5加密)";
                }
                if (stuOut.stuACCaps.nSupportFingerPrint == 0)
                {
                    strCap += "\r\nSupportFingerPrint(是否支持指纹功能):Unknown";
                }
                else if(stuOut.stuACCaps.nSupportFingerPrint == 1)
                {
                    strCap += "\r\nSupportFingerPrint(是否支持指纹功能):NotSupport";
                }
                else if (stuOut.stuACCaps.nSupportFingerPrint == 2)
                {
                    strCap += "\r\nSupportFingerPrint(是否支持指纹功能):Support";
                }
                strCap += "\r\nIsSupportCardAuth(是否支持卡片鉴权):" + stuOut.stuACCaps.bHasCardAuth;
                strCap += "\r\nIsSupportFaceAuth(是否支持目标识别鉴权):" + stuOut.stuACCaps.bHasFaceAuth;
                strCap += "\r\nIsOnlySingleDoorAuth(是否只支持单门授权(发卡)):" + stuOut.stuACCaps.bOnlySingleDoorAuth;
                strCap += "\r\nIsSupportAsynAuth(是否支持授权异步返回):" + stuOut.stuACCaps.bAsynAuth;
                strCap += "\r\nIsSupportUserlsoLate(是否支持人卡分离方案):" + stuOut.stuACCaps.bUserlsoLate;
                strCap += "\r\nMaxInsertRate(机器数据下发插入最大数量):" + stuOut.stuACCaps.nMaxInsertRate;
                if (stuOut.stuACCaps.stuSpecialDaysSchedule.bSupport)
                {
                    strCap += "\r\nMaxSpecialDaysSchedules(设备支持的最大假日计划数量):" + stuOut.stuACCaps.stuSpecialDaysSchedule.nMaxSpecialDaysSchedules;
                    strCap += "\r\nMaxTimePeriodsPerDay(假日计划每天最多的时间段):" + stuOut.stuACCaps.stuSpecialDaysSchedule.nMaxTimePeriodsPerDay;
                    strCap += "\r\nMaxSpecialDayGroups(设备支持的最大假日组数):" + stuOut.stuACCaps.stuSpecialDaysSchedule.nMaxSpecialDayGroups;
                    strCap += "\r\nMaxDaysInSpecialDayGroup(每个假日组里最大的假日数):" + stuOut.stuACCaps.stuSpecialDaysSchedule.nMaxDaysInSpecialDayGroup;
                }
                strCap += "\r\n";

                strCap += "\r\nUserMaxInsertRate(每次下发用户的最大数量):" + stuOut.stuUserCaps.nMaxInsertRate;
                strCap += "\r\nUserMaxUsers(用户数量上限):" + stuOut.stuUserCaps.nMaxUsers;
                strCap += "\r\nUserMaxFingerPrintsPerUser(每个用户可以记录的最大指纹数量):" + stuOut.stuUserCaps.nMaxFingerPrintsPerUser;
                strCap += "\r\nUserMaxCardsPerUser(每个用户可以记录的最大卡片数量):" + stuOut.stuUserCaps.nMaxCardsPerUser;
                strCap += "\r\n";

                strCap += "\r\nCardMaxInsertRate(每次下发卡片最大数量):" + stuOut.stuCardCaps.nMaxInsertRate;
                strCap += "\r\nCardMaxCards(卡片数量上限):" + stuOut.stuCardCaps.nMaxCards;
                strCap += "\r\n";

                strCap += "\r\nFingerprintMaxInsertRate(每次下发指纹最大数量):" + stuOut.stuFingerprintCaps.nMaxInsertRate;
                strCap += "\r\nFingerprintMaxFingerprintSize(单指纹数据的最大字节数):" + stuOut.stuFingerprintCaps.nMaxFingerprintSize;
                strCap += "\r\nFingerprintMaxFingerprint(指纹数量上限):" + stuOut.stuFingerprintCaps.nMaxFingerprint;
                strCap += "\r\n";

                strCap += "\r\nFaceMaxInsertRate(每次下发人脸最大数量):" + stuOut.stuFaceCaps.nMaxInsertRate;
                strCap += "\r\nFaceMaxFace(人脸存储上限):" + stuOut.stuFaceCaps.nMaxFace;
                if(stuOut.stuFaceCaps.nRecognitionType == 0)
                {
                    strCap += "\r\nTargetRecognitionType(目标识别类型):WhiteLight(白光)";
                }
                else
                {
                    strCap += "\r\nTargetRecognitionType(目标识别类型):InfraRed(红外)";
                }
                strCap += "\r\nFaceMinPhotoSize(白光人脸照片的最小尺寸):" + stuOut.stuFaceCaps.nMinPhotoSize;
                strCap += "\r\nFaceMaxPhotoSize(白光人脸照片的最大尺寸):" + stuOut.stuFaceCaps.nMaxPhotoSize;
                strCap += "\r\nFaceMaxGetPhotoNumber(批量获取白光人脸的最大数量):" + stuOut.stuFaceCaps.nMaxGetPhotoNumber;
                strCap += "\r\nFaceIsSupportGetPhoto(是否支持获取白光照片):" + stuOut.stuFaceCaps.bIsSupportGetPhoto;
                strCap += "\r\n";

                txt_Caps.Text = strCap;
            }
            else
            {
                MessageBox.Show(NETClient.GetLastError());
            }
        }
    }
}
