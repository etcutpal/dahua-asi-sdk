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
    public partial class UserFingerprintInfoForm : Form
    {
        private IntPtr m_LoginID = IntPtr.Zero;
        private EM_OperateType m_OperateType = EM_OperateType.Add;
        private NET_ACCESS_FINGERPRINT_INFO m_FingerprintInfo = new NET_ACCESS_FINGERPRINT_INFO();
        private int m_FingerprintNum;

        private static fMessCallBackEx m_MessCallBack;
        private int m_PacketLen;
        private byte[] FingerPrintInfo;
        private Timer m_Timer;
        private bool m_IsListen = false;
        private bool m_IsCollectionFailed = false;
        private bool m_IsCollection = false;

        public UserFingerprintInfoForm()
        {
            InitializeComponent();
        }

        public UserFingerprintInfoForm(IntPtr loginid, EM_OperateType type, NET_ACCESS_FINGERPRINT_INFO info, int num)
        {
            InitializeComponent();
            m_LoginID = loginid;
            m_OperateType = type;
            m_FingerprintInfo = info;
            m_FingerprintNum = num;
        }

        private void UserFingerprintInfoForm_Load(object sender, EventArgs e)
        {
            lab_Result.Text = "";
            m_Timer = new Timer();
            m_Timer.Interval = 30000;
            m_Timer.Tick += new EventHandler(Timer_Tick);
            m_MessCallBack = new fMessCallBackEx(MessCallBack);
            m_IsListen = AccessForm.m_IsListen;
            if (AccessForm.m_IsListen)
            {
                m_MessCallBack += AccessForm.m_AlarmCallBack;
            }
            NETClient.SetDVRMessCallBackEx1(m_MessCallBack, IntPtr.Zero);
        }

        private void Timer_Tick(object sender, EventArgs e)
        {
            m_Timer.Stop();
            this.lab_Result.Text = "Collection failed(采集失败)";
            this.btn_Collection.Enabled = true;
            m_IsCollectionFailed = true;
            if (!AccessForm.m_IsListen && m_IsListen)
            {
                NETClient.StopListen(m_LoginID);
                m_IsListen = false;
            }
        }

        private bool MessCallBack(int lCommand, IntPtr lLoginID, IntPtr pBuf, uint dwBufLen, IntPtr pchDVRIP, int nDVRPort, bool bAlarmAckFlag, int nEventID, IntPtr dwUser)
        {
            if ((EM_ALARM_TYPE)lCommand == EM_ALARM_TYPE.ALARM_FINGER_PRINT)
            {
                string str_result = "";
                NET_ALARM_CAPTURE_FINGER_PRINT_INFO info = (NET_ALARM_CAPTURE_FINGER_PRINT_INFO)Marshal.PtrToStructure(pBuf, typeof(NET_ALARM_CAPTURE_FINGER_PRINT_INFO));
                if (info.bCollectResult)
                {
                    byte[] data = new byte[info.nPacketLen * info.nPacketNum];
                    Marshal.Copy(info.szFingerPrintInfo, data, 0, data.Length);
                    m_PacketLen = info.nPacketLen * info.nPacketNum;
                    FingerPrintInfo = data;

                    str_result = "Collection Completed(采集完成)";

                }
                else
                {
                    m_IsCollectionFailed = true;
                    str_result = "Collection failed(采集失败)";
                }

                m_Timer.Stop();

                BeginInvoke(new Action(() =>
                {
                    lab_Result.Text = str_result;
                    btn_Collection.Enabled = true;
                }));
            }
            return true;
        }

        private void btn_Collection_Click(object sender, EventArgs e)
        {
            if (!AccessForm.m_IsListen)
            {
                m_IsListen = NETClient.StartListen(m_LoginID);
                if (m_IsListen == false)
                {
                    MessageBox.Show(NETClient.GetLastError());
                    return;
                }
            }

            m_IsCollection = true;
            m_IsCollectionFailed = false;
            m_PacketLen = 0;
            FingerPrintInfo = null;
            NET_CTRL_CAPTURE_FINGER_PRINT capture = new NET_CTRL_CAPTURE_FINGER_PRINT();
            capture.dwSize = (uint)Marshal.SizeOf(typeof(NET_CTRL_CAPTURE_FINGER_PRINT));
            capture.nChannelID = 0;
            capture.szReaderID = "1";
            IntPtr inPtr = IntPtr.Zero;
            try
            {
                inPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NET_CTRL_CAPTURE_FINGER_PRINT)));
                Marshal.StructureToPtr(capture, inPtr, true);
                bool ret = NETClient.ControlDevice(m_LoginID, EM_CtrlType.CAPTURE_FINGER_PRINT, inPtr, 60000);
                if (!ret)
                {
                    MessageBox.Show("Start collection failed(开始采集失败)");
                    return;
                }
                m_Timer.Start();
                this.lab_Result.Text = "Start Collection(开始采集)";
                this.btn_Collection.Enabled = false;
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message);
            }
            finally
            {
                Marshal.FreeHGlobal(inPtr);
            }
        }

        private void btn_Cancel_Click(object sender, EventArgs e)
        {
            Close();
        }

        private void btn_Confirm_Click(object sender, EventArgs e)
        {
            if (FingerPrintInfo == null || m_PacketLen == 0)
            {
                if (m_IsCollection == false)
                {
                    MessageBox.Show("Did not start collecting(没有开始采集)");
                }
                else if (m_IsCollectionFailed)
                {
                    MessageBox.Show("No fingerprint data,because collection failed(没有指纹数据,因为采集失败)");
                }
                else if (m_IsListen)
                {
                    MessageBox.Show("In the collection(采集中)");
                }
                else
                {
                    MessageBox.Show("Unknow Error(未知错误)");
                }
                return;
            }

            bool bRet = false;

            if (m_OperateType == EM_OperateType.Add)
            {
                m_FingerprintInfo.nPacketNum = 1;
                m_FingerprintInfo.nPacketLen = m_PacketLen;
                m_FingerprintInfo.szFingerPrintInfo = Marshal.AllocHGlobal(m_PacketLen);
                for (int i = 0; i < m_PacketLen; i++)
                {
                    Marshal.WriteByte(m_FingerprintInfo.szFingerPrintInfo, i, FingerPrintInfo[i]);
                }
                m_FingerprintInfo.nDuressIndex = 0;
                if (ckb_Duress.Checked)
                {
                    m_FingerprintInfo.nDuressIndex = 1;
                }

                NET_ACCESS_FINGERPRINT_INFO[] stuInArray = new NET_ACCESS_FINGERPRINT_INFO[1] { m_FingerprintInfo };
                NET_EM_FAILCODE[] stuOutArray;

                bRet = NETClient.InsertOperateAccessFingerprintService(m_LoginID, stuInArray, out stuOutArray, 3000);
                if (!bRet)
                {
                    for (int i = 0; i < stuOutArray.Length; i++)
                    {
                        MessageBox.Show(GetFailCodeMsg(stuOutArray[i].emCode));
                    }
                }
            }
            else if(m_OperateType == EM_OperateType.Modify)
            {
                if(m_PacketLen!= m_FingerprintInfo.nPacketLen)
                {
                    MessageBox.Show("指纹数据长度和修改前的不匹配！");
                    return;
                }
                for (int i = 0; i < m_PacketLen; i++)
                {
                    Marshal.WriteByte(m_FingerprintInfo.szFingerPrintInfo, (m_FingerprintNum - 1) * m_PacketLen + i, FingerPrintInfo[i]);
                }
                if (ckb_Duress.Checked)
                {
                    m_FingerprintInfo.nDuressIndex = m_FingerprintNum;
                }
                else
                {
                    if(m_FingerprintInfo.nDuressIndex == m_FingerprintNum)
                    {
                        m_FingerprintInfo.nDuressIndex = 0;
                    }
                }

                NET_ACCESS_FINGERPRINT_INFO[] stuInArray = new NET_ACCESS_FINGERPRINT_INFO[1] { m_FingerprintInfo };
                NET_EM_FAILCODE[] stuOutArray;

                bRet = NETClient.UpdateOperateAccessFingerprintService(m_LoginID, stuInArray, out stuOutArray, 3000);
                if (!bRet)
                {
                    for (int i = 0; i < stuOutArray.Length; i++)
                    {
                        MessageBox.Show(GetFailCodeMsg(stuOutArray[i].emCode));
                    }
                }
            }

            Close();
        }

        protected override void OnClosed(EventArgs e)
        {
            m_MessCallBack = null;
            if (AccessForm.m_IsListen)
            {
                NETClient.SetDVRMessCallBackEx1(AccessForm.m_AlarmCallBack, IntPtr.Zero);
            }
            else
            {
                NETClient.SetDVRMessCallBack(null, IntPtr.Zero);
                if (m_IsListen)
                {
                    NETClient.StopListen(m_LoginID);
                    m_IsListen = false;
                }
            }
            m_Timer.Stop();
            m_Timer.Dispose();
            base.OnClosed(e);
        }

        private string GetFailCodeMsg(EM_FAILCODE em)
        {
            string failMsg = "";
            switch (em)
            {
                case EM_FAILCODE.NOERROR:
                    break;
                case EM_FAILCODE.UNKNOWN:
                    failMsg = "UNKNOWN(未知错误)";
                    break;
                case EM_FAILCODE.INVALID_PARAM:
                    failMsg = "INVALID_PARAM(参数错误)";
                    break;
                case EM_FAILCODE.INVALID_PASSWORD:
                    failMsg = "INVALID_PASSWORD(无效密码)";
                    break;
                case EM_FAILCODE.INVALID_FP:
                    failMsg = "INVALID_FP(无效指纹数据)";
                    break;
                case EM_FAILCODE.INVALID_FACE:
                    failMsg = "INVALID_FACE(无效人脸数据)";
                    break;
                case EM_FAILCODE.INVALID_CARD:
                    failMsg = "INVALID_CARD(无效卡数据)";
                    break;
                case EM_FAILCODE.INVALID_USER:
                    failMsg = "INVALID_USER(无效人数据)";
                    break;
                case EM_FAILCODE.FAILED_GET_SUBSERVICE:
                    failMsg = "FAILED_GET_SUBSERVICE(能力集子服务获取失败)";
                    break;
                case EM_FAILCODE.FAILED_GET_METHOD:
                    failMsg = "FAILED_GET_METHOD(获取组件的方法集失败)";
                    break;
                case EM_FAILCODE.FAILED_GET_SUBCAPS:
                    failMsg = "FAILED_GET_SUBCAPS(获取资源实体能力集失败)";
                    break;
                case EM_FAILCODE.ERROR_INSERT_LIMIT:
                    failMsg = "ERROR_INSERT_LIMIT(已达插入上限)";
                    break;
                case EM_FAILCODE.ERROR_MAX_INSERT_RATE:
                    failMsg = "ERROR_MAX_INSERT_RATE(已达最大插入速度)";
                    break;
                case EM_FAILCODE.FAILED_ERASE_FP:
                    failMsg = "FAILED_ERASE_FP(清除指纹数据失败)";
                    break;
                case EM_FAILCODE.FAILED_ERASE_FACE:
                    failMsg = "FAILED_ERASE_FACE(清除人脸数据失败)";
                    break;
                case EM_FAILCODE.FAILED_ERASE_CARD:
                    failMsg = "FAILED_ERASE_CARD(清除卡数据失败)";
                    break;
                case EM_FAILCODE.NO_RECORD:
                    failMsg = "NO_RECORD(没有记录)";
                    break;
                case EM_FAILCODE.NOMORE_RECORD:
                    failMsg = "NOMORE_RECORD(查找到最后，没有更多记录)";
                    break;
                case EM_FAILCODE.RECORD_ALREADY_EXISTS:
                    failMsg = "RECORD_ALREADY_EXISTS(下发卡或指纹时，数据重复)";
                    break;
                case EM_FAILCODE.MAX_FP_PERUSER:
                    failMsg = "MAX_FP_PERUSER(超过个人最大指纹记录数)";
                    break;
                case EM_FAILCODE.MAX_CARD_PERUSER:
                    failMsg = "MAX_CARD_PERUSER(超过个人最大卡片记录数)";
                    break;
                case EM_FAILCODE.EXCEED_MAX_PHOTOSIZE:
                    failMsg = "EXCEED_MAX_PHOTOSIZE(超出最大照片大小)";
                    break;
                case EM_FAILCODE.INVALID_USERID:
                    failMsg = "INVALID_USERID(用户ID无效(未找到客户))";
                    break;
                case EM_FAILCODE.EXTRACTFEATURE_FAIL:
                    failMsg = "EXTRACTFEATURE_FAIL(提取人脸特征失败)";
                    break;
                case EM_FAILCODE.PHOTO_EXIST:
                    failMsg = "PHOTO_EXIST(人脸照片已存在)";
                    break;
                case EM_FAILCODE.PHOTO_OVERFLOW:
                    failMsg = "PHOTO_OVERFLOW(超出最大人脸照片数)";
                    break;
                case EM_FAILCODE.INVALID_PHOTO_FORMAT:
                    failMsg = "INVALID_PHOTO_FORMAT(照片格式无效)";
                    break;
                case EM_FAILCODE.EXCEED_ADMINISTRATOR_LIMIT:
                    failMsg = "EXCEED_ADMINISTRATOR_LIMIT(超出管理员人数限制)";
                    break;
                default:
                    failMsg = "UNKNOWN(未知错误)";
                    break;
            }
            return failMsg;
        }
    }
}
