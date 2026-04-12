using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using NetSDKCS;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

namespace AccessDemo2s
{
    public partial class AccessForm : Form
    {
        private static readonly string titleName = "AccessControl2S Demo(门禁二代Demo)";
        private IntPtr m_LoginID = IntPtr.Zero;
        private const string CFG_CMD_ACCESS_EVENT = "AccessControl";
        private const int ALARM_START = 0;
        private const int ALARM_STOP = 1;

        private int m_AccessCount = 0;
        public static bool m_IsListen = false;
        private const int m_WaitTime = 5000;
        private static int Alarm_Index = 1;
        private byte[] data;
        private const int ListViewCount = 100; //默认显示报警信息最大数量

        private static fDisConnectCallBack m_DisConnectCallBack;//断线回调
        private static fHaveReConnectCallBack m_ReConnectCallBack;//重连回调
        public static fMessCallBackEx m_AlarmCallBack; //报警回调

        public AccessForm()
        {
            InitializeComponent();
        }

        private void AccessDemo2s_Load(object sender, EventArgs e)
        {
            Text = titleName;
            m_DisConnectCallBack = new fDisConnectCallBack(DisConnectCallBack);
            m_ReConnectCallBack = new fHaveReConnectCallBack(ReConnectCallBack);
            m_AlarmCallBack = new fMessCallBackEx(AlarmCallBack);

            try
            {
                //初始化
                NETClient.Init(m_DisConnectCallBack, IntPtr.Zero, null);
                //打开日志
                NET_LOG_SET_PRINT_INFO logInfo = new NET_LOG_SET_PRINT_INFO()
                {
                    dwSize = (uint)Marshal.SizeOf(typeof(NET_LOG_SET_PRINT_INFO))
                };
                NETClient.LogOpen(logInfo);
                //设置断线重连回调
                NETClient.SetAutoReconnect(m_ReConnectCallBack, IntPtr.Zero);
                
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message);
                Process.GetCurrentProcess().Kill();
            }
        }

        #region Update UI 更新UI

        private void UpdateDisConnectUI()
        {
            this.Text = titleName + " -- Offline(离线)";

            InitOrCloseOtherUI();
        }

        private void UpdateReConnectUI()
        {
            this.Text = titleName + " -- Online(在线)";

            OpenOtherUI();
        }


        private void InitOrLogoutUI()
        {
            this.Text = titleName;
            btn_Login.Text = "Login(登录)";

            InitOrCloseOtherUI();
        }

        private void LoginUI()
        {
            this.Text = titleName + " -- Online(在线)";
            btn_Login.Text = "Logout(登出)";

            OpenOtherUI();
        }

        private void InitOrCloseOtherUI()
        {
            //其他控件操作初始化

            channel_comboBox.Items.Clear();
            btn_OpenDoor.Enabled = false;
            btn_CloseDoor.Enabled = false;
            btn_GetState.Enabled = false;
            btn_OpenAlways.Enabled = false;
            btn_CloseAlways.Enabled = false;

            btn_UserOperate.Enabled = false;
            btn_AccessPassword.Enabled = false;
            btn_GeneralConfig.Enabled = false;

            btn_StartListen.Enabled = false;
            btn_Query.Enabled = false;
            btn_OpenEvent.Enabled = false;

            menu_SystemConfig.Enabled = false;
            menu_AdvanceConfig.Enabled = false;
        }

        private void OpenOtherUI()
        {
            //其他控件操作使能

            channel_comboBox.Items.Clear();
            if (m_AccessCount > 0)
            {
                for (int i = 0; i < m_AccessCount; i++)
                {
                    channel_comboBox.Items.Add(i + 1);
                }
                channel_comboBox.SelectedIndex = 0;
            }

            btn_OpenDoor.Enabled = true;
            btn_CloseDoor.Enabled = true;
            btn_GetState.Enabled = true;
            btn_OpenAlways.Enabled = true;
            btn_CloseAlways.Enabled = true;

            btn_UserOperate.Enabled = true;
            btn_AccessPassword.Enabled = true;
            btn_GeneralConfig.Enabled = true;

            btn_StartListen.Enabled = true;
            btn_Query.Enabled = true;
            btn_OpenEvent.Enabled = true;

            menu_SystemConfig.Enabled = true;
            menu_AdvanceConfig.Enabled = true;
        }

        #endregion

        #region CallBack 回调

        private void DisConnectCallBack(IntPtr lLoginID, IntPtr pchDVRIP, int nDVRPort, IntPtr dwUser)
        {
            this.BeginInvoke((Action)UpdateDisConnectUI);
        }

        private void ReConnectCallBack(IntPtr lLoginID, IntPtr pchDVRIP, int nDVRPort, IntPtr dwUser)
        {
            this.BeginInvoke((Action)UpdateReConnectUI);
        }

        private bool AlarmCallBack(int lCommand, IntPtr lLoginID, IntPtr pBuf, uint dwBufLen, IntPtr pchDVRIP, int nDVRPort, bool bAlarmAckFlag, int nEventID, IntPtr dwUser)
        {
            EM_ALARM_TYPE type = (EM_ALARM_TYPE)lCommand;
            var item = new ListViewItem();
            switch (type)
            {
                case EM_ALARM_TYPE.ALARM_ACCESS_CTL_EVENT:
                    NET_ALARM_ACCESS_CTL_EVENT_INFO access_info = (NET_ALARM_ACCESS_CTL_EVENT_INFO)Marshal.PtrToStructure(pBuf, typeof(NET_ALARM_ACCESS_CTL_EVENT_INFO));
                    item.Text = Alarm_Index.ToString();
                    item.SubItems.Add(access_info.stuTime.ToString());
                    item.SubItems.Add("Entry(进门)");
                    item.SubItems.Add(access_info.szUserID);
                    item.SubItems.Add(access_info.szCardNo.ToString());
                    item.SubItems.Add(access_info.nDoor.ToString());
                    item.SubItems.Add(AccessDoorOpenMethod2Str(access_info.emOpenMethod));
                    if (access_info.bStatus)
                    {
                        item.SubItems.Add("Success(成功)");
                    }
                    else
                    {
                        item.SubItems.Add("Failure(失败)");
                    }

                    this.BeginInvoke(new Action(() =>
                    {
                        listView_event.BeginUpdate();
                        listView_event.Items.Insert(0, item);
                        if (listView_event.Items.Count > ListViewCount)
                        {
                            listView_event.Items.RemoveAt(ListViewCount);
                        }
                        listView_event.EndUpdate();
                    }));
                    Alarm_Index++;
                    break;
                case EM_ALARM_TYPE.ALARM_ACCESS_CTL_NOT_CLOSE:
                    NET_ALARM_ACCESS_CTL_NOT_CLOSE_INFO notclose_info = (NET_ALARM_ACCESS_CTL_NOT_CLOSE_INFO)Marshal.PtrToStructure(pBuf, typeof(NET_ALARM_ACCESS_CTL_NOT_CLOSE_INFO));
                    item.Text = Alarm_Index.ToString();
                    item.SubItems.Add(notclose_info.stuTime.ToString());
                    item.SubItems.Add("NotClose(门未关)");
                    item.SubItems.Add("");
                    item.SubItems.Add("");
                    item.SubItems.Add(notclose_info.nDoor.ToString());
                    item.SubItems.Add("");
                    if (notclose_info.nAction == ALARM_START)
                    {
                        item.SubItems.Add("Start(开始)");
                    }
                    else if (notclose_info.nAction == ALARM_STOP)
                    {
                        item.SubItems.Add("Stop(结束)");
                    }
                    else
                    {
                        item.SubItems.Add("");
                    }

                    this.BeginInvoke(new Action(() =>
                    {
                        listView_event.BeginUpdate();
                        listView_event.Items.Insert(0, item);
                        if (listView_event.Items.Count > ListViewCount)
                        {
                            listView_event.Items.RemoveAt(ListViewCount);
                        }
                        listView_event.EndUpdate();
                    }));
                    Alarm_Index++;
                    break;
                case EM_ALARM_TYPE.ALARM_ACCESS_CTL_BREAK_IN:
                    NET_ALARM_ACCESS_CTL_BREAK_IN_INFO breakin_info = (NET_ALARM_ACCESS_CTL_BREAK_IN_INFO)Marshal.PtrToStructure(pBuf, typeof(NET_ALARM_ACCESS_CTL_BREAK_IN_INFO));
                    item.Text = Alarm_Index.ToString();
                    item.SubItems.Add(breakin_info.stuTime.ToString());
                    item.SubItems.Add("BreakIn(闯入)");
                    item.SubItems.Add("");
                    item.SubItems.Add("");
                    item.SubItems.Add(breakin_info.nDoor.ToString());
                    item.SubItems.Add("");
                    item.SubItems.Add("");

                    this.BeginInvoke(new Action(() =>
                    {
                        listView_event.BeginUpdate();
                        listView_event.Items.Insert(0, item);
                        if (listView_event.Items.Count > ListViewCount)
                        {
                            listView_event.Items.RemoveAt(ListViewCount);
                        }
                        listView_event.EndUpdate();
                    }));
                    Alarm_Index++;
                    break;
                case EM_ALARM_TYPE.ALARM_ACCESS_CTL_REPEAT_ENTER:
                    NET_ALARM_ACCESS_CTL_REPEAT_ENTER_INFO repeat_info = (NET_ALARM_ACCESS_CTL_REPEAT_ENTER_INFO)Marshal.PtrToStructure(pBuf, typeof(NET_ALARM_ACCESS_CTL_REPEAT_ENTER_INFO));
                    item.Text = Alarm_Index.ToString();
                    item.SubItems.Add(repeat_info.stuTime.ToString());
                    item.SubItems.Add("RepeakIn(反潜)");
                    item.SubItems.Add("");
                    item.SubItems.Add(repeat_info.szCardNo.ToString());
                    item.SubItems.Add(repeat_info.nDoor.ToString());
                    item.SubItems.Add("");
                    item.SubItems.Add("");

                    this.BeginInvoke(new Action(() =>
                    {
                        listView_event.BeginUpdate();
                        listView_event.Items.Insert(0, item);
                        if (listView_event.Items.Count > ListViewCount)
                        {
                            listView_event.Items.RemoveAt(ListViewCount);
                        }
                        listView_event.EndUpdate();
                    }));
                    Alarm_Index++;
                    break;
                case EM_ALARM_TYPE.ALARM_ACCESS_CTL_DURESS:
                    NET_ALARM_ACCESS_CTL_DURESS_INFO duress_info = (NET_ALARM_ACCESS_CTL_DURESS_INFO)Marshal.PtrToStructure(pBuf, typeof(NET_ALARM_ACCESS_CTL_DURESS_INFO));
                    item.Text = Alarm_Index.ToString();
                    item.SubItems.Add(duress_info.stuTime.ToString());
                    item.SubItems.Add("Duress(胁迫)");
                    item.SubItems.Add(duress_info.szUserID.ToString());
                    item.SubItems.Add(duress_info.szCardNo.ToString());
                    item.SubItems.Add(duress_info.nDoor.ToString());
                    item.SubItems.Add("");
                    item.SubItems.Add("");

                    this.BeginInvoke(new Action(() =>
                    {
                        listView_event.BeginUpdate();
                        listView_event.Items.Insert(0, item);
                        if (listView_event.Items.Count > ListViewCount)
                        {
                            listView_event.Items.RemoveAt(ListViewCount);
                        }
                        listView_event.EndUpdate();
                    }));
                    Alarm_Index++;
                    break;
                case EM_ALARM_TYPE.ALARM_CHASSISINTRUDED:
                    NET_ALARM_CHASSISINTRUDED_INFO chassisintruded_info = (NET_ALARM_CHASSISINTRUDED_INFO)Marshal.PtrToStructure(pBuf, typeof(NET_ALARM_CHASSISINTRUDED_INFO));
                    item.Text = Alarm_Index.ToString();
                    item.SubItems.Add(chassisintruded_info.stuTime.ToString());
                    if (chassisintruded_info.szReaderID.Length > 0)
                    {
                        item.SubItems.Add("CardreaderAntidemolition(读卡器防拆)");
                    }
                    else
                    {
                        item.SubItems.Add("ChassisIntruded(本机防拆)");
                    }
                    item.SubItems.Add("");
                    item.SubItems.Add("");
                    item.SubItems.Add(chassisintruded_info.nChannelID.ToString());
                    item.SubItems.Add("");
                    if (chassisintruded_info.nAction == ALARM_START)
                    {
                        item.SubItems.Add("Start(开始)");
                    }
                    else if (chassisintruded_info.nAction == ALARM_STOP)
                    {
                        item.SubItems.Add("Stop(结束)");
                    }
                    else
                    {
                        item.SubItems.Add("");
                    }

                    this.BeginInvoke(new Action(() =>
                    {
                        listView_event.BeginUpdate();
                        listView_event.Items.Insert(0, item);
                        if (listView_event.Items.Count > ListViewCount)
                        {
                            listView_event.Items.RemoveAt(ListViewCount);
                        }
                        listView_event.EndUpdate();
                    }));
                    Alarm_Index++;
                    break;
                case EM_ALARM_TYPE.ALARM_ALARM_EX2:
                    NET_ALARM_ALARM_INFO_EX2 alarm_info = (NET_ALARM_ALARM_INFO_EX2)Marshal.PtrToStructure(pBuf, typeof(NET_ALARM_ALARM_INFO_EX2));
                    item.Text = Alarm_Index.ToString();
                    item.SubItems.Add(alarm_info.stuTime.ToString());
                    item.SubItems.Add("AlarmEx2(外部报警)");
                    item.SubItems.Add("");
                    item.SubItems.Add("");
                    item.SubItems.Add(alarm_info.nChannelID.ToString());
                    item.SubItems.Add("");
                    if (alarm_info.nAction == ALARM_START)
                    {
                        item.SubItems.Add("Start(开始)");
                    }
                    else if (alarm_info.nAction == ALARM_STOP)
                    {
                        item.SubItems.Add("Stop(结束)");
                    }
                    else
                    {
                        item.SubItems.Add("");
                    }

                    this.BeginInvoke(new Action(() =>
                    {
                        listView_event.BeginUpdate();
                        listView_event.Items.Insert(0, item);
                        if (listView_event.Items.Count > ListViewCount)
                        {
                            listView_event.Items.RemoveAt(ListViewCount);
                        }
                        listView_event.EndUpdate();
                    }));
                    Alarm_Index++;
                    break;
                case EM_ALARM_TYPE.ALARM_ACCESS_CTL_MALICIOUS:
                    NET_ALARM_ACCESS_CTL_MALICIOUS malicious_info = (NET_ALARM_ACCESS_CTL_MALICIOUS)Marshal.PtrToStructure(pBuf, typeof(NET_ALARM_ACCESS_CTL_MALICIOUS));
                    item.Text = Alarm_Index.ToString();
                    item.SubItems.Add(malicious_info.stuTime.ToShortString());
                    item.SubItems.Add("Malicious(恶意开门)");
                    item.SubItems.Add("");
                    item.SubItems.Add("");
                    item.SubItems.Add(malicious_info.nChannel.ToString());
                    switch (malicious_info.emMethod)
                    {
                        case NET_ACCESS_METHOD.CARD:
                            item.SubItems.Add("Card(卡)");
                            break;
                        case NET_ACCESS_METHOD.PASSWORD:
                            item.SubItems.Add("Password(密码)");
                            break;
                        case NET_ACCESS_METHOD.FINGERPRINT:
                            item.SubItems.Add("Fingerprint(指纹)");
                            break;
                        default:
                            item.SubItems.Add("Unknown(未知)");
                            break;
                    }
                    if (malicious_info.nAction == 1)
                    {
                        item.SubItems.Add("Start(开始)");
                    }
                    else if (malicious_info.nAction == 2)
                    {
                        item.SubItems.Add("Stop(结束)");
                    }
                    else
                    {
                        item.SubItems.Add("");
                    }

                    this.BeginInvoke(new Action(() =>
                    {
                        listView_event.BeginUpdate();
                        listView_event.Items.Insert(0, item);
                        if (listView_event.Items.Count > ListViewCount)
                        {
                            listView_event.Items.RemoveAt(ListViewCount);
                        }
                        listView_event.EndUpdate();
                    }));
                    Alarm_Index++;
                    break;
                default:
                    break;
            }

            return true;
        }

        #endregion

        private void btn_Login_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero == m_LoginID)
            {
                ushort port = 0;
                try
                {
                    port = Convert.ToUInt16(port_textBox.Text.Trim());
                }
                catch
                {
                    MessageBox.Show("Input port error");
                    return;
                }
                NET_DEVICEINFO_Ex deviceInfo = new NET_DEVICEINFO_Ex();
                m_LoginID = NETClient.LoginWithHighLevelSecurity(ip_textBox.Text.Trim(), port, user_textBox.Text.Trim(), pwd_textBox.Text.Trim(), EM_LOGIN_SPAC_CAP_TYPE.TCP, IntPtr.Zero, ref deviceInfo);
                if (IntPtr.Zero == m_LoginID)
                {
                    MessageBox.Show(this, NETClient.GetLastError());
                    return;
                }
                else
                {
                    GetAccessCount();
                }
                LoginUI();
            }
            else
            {
                if (m_IsListen)
                {
                    bool ret = NETClient.StopListen(m_LoginID);
                    if (!ret)
                    {
                        MessageBox.Show(this, NETClient.GetLastError());
                    }
                    Alarm_Index = 1;
                    m_IsListen = false;
                    listView_event.Items.Clear();
                    btn_StartListen.Text = "StartListen(开启订阅)";
                }
                if (IntPtr.Zero != m_LoginID)
                {
                    bool result = NETClient.Logout(m_LoginID);
                    if (!result)
                    {
                        MessageBox.Show(this, NETClient.GetLastError());
                    }
                }

                m_LoginID = IntPtr.Zero;
                InitOrLogoutUI();
            }
        }

        private void btn_GetState_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero == m_LoginID)
            {
                return;
            }
            NET_DOOR_STATUS_INFO info = new NET_DOOR_STATUS_INFO();
            info.dwSize = (uint)Marshal.SizeOf(typeof(NET_DOOR_STATUS_INFO));
            info.nChannel = channel_comboBox.SelectedIndex;
            object objInfo = info;
            bool ret = NETClient.QueryDevState(m_LoginID, EM_DEVICE_STATE.DOOR_STATE, ref objInfo, typeof(NET_DOOR_STATUS_INFO), m_WaitTime);
            if (!ret)
            {
                MessageBox.Show(NETClient.GetLastError());
                return;
            }
            info = (NET_DOOR_STATUS_INFO)objInfo;
            string lockStatus = Enum.GetName(typeof(EM_NET_DOOR_STATUS_TYPE), info.emStateType);
            MessageBox.Show(lockStatus);
        }

        private void btn_OpenDoor_Click(object sender, EventArgs e)
        {
            GetConfig();
            if (cfg.emState != EM_CFG_ACCESS_STATE.NORMAL)
            {
                cfg.emState = EM_CFG_ACCESS_STATE.NORMAL;
                bool result = SetConfig(cfg);
                if (!result)
                {
                    MessageBox.Show(this, NETClient.GetLastError());
                    return;
                }
            }

            NET_CTRL_ACCESS_OPEN openInfo = new NET_CTRL_ACCESS_OPEN();
            openInfo.dwSize = (uint)Marshal.SizeOf(typeof(NET_CTRL_ACCESS_OPEN));
            openInfo.nChannelID = channel_comboBox.SelectedIndex;
            openInfo.szTargetID = IntPtr.Zero;
            openInfo.emOpenDoorType = EM_OPEN_DOOR_TYPE.REMOTE;
            IntPtr inPtr = IntPtr.Zero;
            try
            {
                inPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NET_CTRL_ACCESS_OPEN)));
                Marshal.StructureToPtr(openInfo, inPtr, true);
                bool ret = NETClient.ControlDevice(m_LoginID, EM_CtrlType.ACCESS_OPEN, inPtr, m_WaitTime);
                if (!ret)
                {
                    MessageBox.Show("Open door failed(开门失败)");
                    return;
                }
            }
            finally
            {
                Marshal.FreeHGlobal(inPtr);
            }
            MessageBox.Show("Open door successfully(开门成功)");

        }

        private void btn_CloseDoor_Click(object sender, EventArgs e)
        {
            GetConfig();
            if (cfg.emState != EM_CFG_ACCESS_STATE.NORMAL)
            {
                cfg.emState = EM_CFG_ACCESS_STATE.NORMAL;
                bool result = SetConfig(cfg);
                if (!result)
                {
                    MessageBox.Show(this, NETClient.GetLastError());
                    return;
                }
            }

            NET_CTRL_ACCESS_CLOSE closeInfo = new NET_CTRL_ACCESS_CLOSE();
            closeInfo.dwSize = (uint)Marshal.SizeOf(typeof(NET_CTRL_ACCESS_CLOSE));
            closeInfo.nChannelID = channel_comboBox.SelectedIndex;
            IntPtr inPtr = IntPtr.Zero;
            try
            {
                inPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NET_CTRL_ACCESS_CLOSE)));
                Marshal.StructureToPtr(closeInfo, inPtr, true);
                bool ret = NETClient.ControlDevice(m_LoginID, EM_CtrlType.ACCESS_CLOSE, inPtr, m_WaitTime);
                if (!ret)
                {
                    MessageBox.Show("Close door failed(关门失败)");
                    return;
                }
            }
            finally
            {
                Marshal.FreeHGlobal(inPtr);
            }
            MessageBox.Show("Close door successfully(关门成功)");
        }

        NET_CFG_ACCESS_EVENT_INFO cfg = new NET_CFG_ACCESS_EVENT_INFO();
        public NET_CFG_ACCESS_EVENT_INFO GetConfig()
        {
            try
            {
                object objTemp = new object();
                bool bRet = NETClient.GetNewDevConfig(m_LoginID, channel_comboBox.SelectedIndex, CFG_CMD_ACCESS_EVENT, ref objTemp, typeof(NET_CFG_ACCESS_EVENT_INFO), m_WaitTime);
                cfg = (NET_CFG_ACCESS_EVENT_INFO)objTemp;
            }
            catch (NETClientExcetion nex)
            {
                MessageBox.Show(nex.Message);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message);
            }
            return cfg;
        }

        public bool SetConfig(NET_CFG_ACCESS_EVENT_INFO cfg)
        {
            bool bRet = false;
            try
            {
                bRet = NETClient.SetNewDevConfig(m_LoginID, channel_comboBox.SelectedIndex, CFG_CMD_ACCESS_EVENT, (object)cfg, typeof(NET_CFG_ACCESS_EVENT_INFO), m_WaitTime);
            }
            catch (NETClientExcetion nex)
            {
                MessageBox.Show(nex.Message);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message);
            }
            return bRet;
        }

        private void btn_OpenAlways_Click(object sender, EventArgs e)
        {
            GetConfig();
            if (cfg.emState != EM_CFG_ACCESS_STATE.OPENALWAYS)
            {
                cfg.emState = EM_CFG_ACCESS_STATE.OPENALWAYS;
                bool result = SetConfig(cfg);
                if (!result)
                {
                    MessageBox.Show(this, NETClient.GetLastError());
                    return;
                }
            }
            MessageBox.Show("Set openalways successfully(设置常开成功)");
        }

        private void btn_CloseAlways_Click(object sender, EventArgs e)
        {
            GetConfig();
            if (cfg.emState != EM_CFG_ACCESS_STATE.CLOSEALWAYS)
            {
                cfg.emState = EM_CFG_ACCESS_STATE.CLOSEALWAYS;
                bool result = SetConfig(cfg);
                if (!result)
                {
                    MessageBox.Show(this, NETClient.GetLastError());
                    return;
                }
            }
            MessageBox.Show("Set closealways successfully(设置常关成功)");
        }

        private void btn_StartListen_Click(object sender, EventArgs e)
        {
            if (!m_IsListen)
            {
                //设置报警回调
                NETClient.SetDVRMessCallBackEx1(m_AlarmCallBack, IntPtr.Zero);

                bool ret = NETClient.StartListen(m_LoginID);
                if (!ret)
                {
                    MessageBox.Show(this, NETClient.GetLastError());
                    return;
                }
                m_IsListen = true;
                Alarm_Index = 1;
                btn_StartListen.Text = "StopListen(停止订阅)";
            }
            else
            {
                bool ret = NETClient.StopListen(m_LoginID);
                if (!ret)
                {
                    MessageBox.Show(this, NETClient.GetLastError());
                    return;
                }
                Alarm_Index = 1;
                m_IsListen = false;
                listView_event.Items.Clear();
                btn_StartListen.Text = "StartListen(开启订阅)";
            }
        }

        private void btn_UserOperate_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero != m_LoginID)
            {
                UserManageFrom userManageForm = new UserManageFrom(m_LoginID, m_AccessCount);
                userManageForm.ShowDialog();
                userManageForm.Dispose();
            }
            else
            {
                MessageBox.Show("Please login first!(请先登录！)");
            }
        }

        private void btn_Query_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero != m_LoginID)
            {
                RecordQueryForm queryRecordForm = new RecordQueryForm(m_LoginID);
                queryRecordForm.ShowDialog();
                queryRecordForm.Dispose();
            }
            else
            {
                MessageBox.Show("Please login first!(请先登录！)");
            }
        }

        private void btn_AccessPassword_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero != m_LoginID)
            {
                AccessPasswordForm accessPasswordForm = new AccessPasswordForm(m_LoginID, m_AccessCount);
                accessPasswordForm.ShowDialog();
                accessPasswordForm.Dispose();
            }
            else
            {
                MessageBox.Show("Please login first!(请先登录！)");
            }
        }

        private void btn_GeneralConfig_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero != m_LoginID)
            {
                GeneralConfigForm configForm = new GeneralConfigForm(m_LoginID, m_AccessCount);
                configForm.ShowDialog();
                configForm.Dispose();
            }
            else
            {
                MessageBox.Show("Please login first!(请先登录！)");
            }
        }

        private void menu_OpenDoorGroup_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero != m_LoginID)
            {
                OpenDoorGroupForm openDoorGroup = new OpenDoorGroupForm(m_LoginID, m_AccessCount);
                openDoorGroup.ShowDialog();
                openDoorGroup.Dispose();
            }
            else
            {
                MessageBox.Show("Please login first!(请先登录！)");
            }
        }

        private void menu_FirstEnter_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero != m_LoginID)
            {
                FirstEnterForm firstEnter = new FirstEnterForm(m_LoginID, m_AccessCount);
                firstEnter.ShowDialog();
                firstEnter.Dispose();
            }
            else
            {
                MessageBox.Show("Please login first!(请先登录！)");
            }
        }

        private void menu_MultidoorInterlock_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero != m_LoginID)
            {
                MultidoorInterlockForm multidoor = new MultidoorInterlockForm(m_LoginID);
                multidoor.ShowDialog();
                multidoor.Dispose();
            }
            else
            {
                MessageBox.Show("Please login first!(请先登录！)");
            }
        }

        private void menu_RepeatEnter_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero != m_LoginID)
            {
                RepeatEnterForm repeatEnter = new RepeatEnterForm(m_LoginID, m_AccessCount);
                repeatEnter.ShowDialog();
                repeatEnter.Dispose();
            }
            else
            {
                MessageBox.Show("Please login first!(请先登录！)");
            }
        }

        private void menu_DeviceInfo_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero != m_LoginID)
            {
                DeviceInfoForm deviceInfo = new DeviceInfoForm(m_LoginID);
                deviceInfo.ShowDialog();
                deviceInfo.Dispose();
            }
            else
            {
                MessageBox.Show("Please login first!(请先登录！)");
            }
        }

        private void menu_Net_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero != m_LoginID)
            {
                NetConfigForm netConfig = new NetConfigForm(m_LoginID);
                netConfig.ShowDialog();
                netConfig.Dispose();
            }
            else
            {
                MessageBox.Show("Please login first!(请先登录！)");
            }
        }

        private void menu_DeviceTime_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero != m_LoginID)
            {
                DeviceTimeForm deviceTime = new DeviceTimeForm(m_LoginID);
                deviceTime.ShowDialog();
                deviceTime.Dispose();
            }
            else
            {
                MessageBox.Show("Please login first!(请先登录！)");
            }
        }

        private void menu_ChangePwd_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero != m_LoginID)
            {
                ChangePasswordForm changePwd = new ChangePasswordForm(m_LoginID);
                changePwd.ShowDialog();
                changePwd.Dispose();
            }
            else
            {
                MessageBox.Show("Please login first!(请先登录！)");
            }
        }

        private void menu_Reboot_Click(object sender, EventArgs e)
        {
            DialogResult dr = MessageBox.Show("Are you sure to reboot(是否确认重启)?", "Prompt(提示)", MessageBoxButtons.OKCancel);
            if (dr == DialogResult.OK)
            {
                IntPtr inPtr = IntPtr.Zero;
                bool ret = NETClient.ControlDevice(m_LoginID, EM_CtrlType.REBOOT, inPtr, 10000);
                if (!ret)
                {
                    MessageBox.Show(NETClient.GetLastError());
                    return;
                }
            }
        }

        private void menu_ConfigReset_Click(object sender, EventArgs e)
        {
            DialogResult dr = MessageBox.Show("Are you sure to reset all(是否确认重置配置)?", "Prompt(提示)", MessageBoxButtons.OKCancel);
            if (dr == DialogResult.OK)
            {
                NET_IN_RESET_SYSTEM stuResetIn = new NET_IN_RESET_SYSTEM();
                stuResetIn.dwSize = (uint)Marshal.SizeOf(typeof(NET_IN_USERINFO_START_FIND));

                NET_OUT_RESET_SYSTEM stuResetOut = new NET_OUT_RESET_SYSTEM();
                stuResetOut.dwSize = (uint)Marshal.SizeOf(typeof(NET_OUT_USERINFO_START_FIND));
                bool nRet = NETClient.ResetSystem(m_LoginID, ref stuResetIn, ref stuResetOut, 5000);
                if (!nRet)
                {
                    IntPtr inPtr = IntPtr.Zero;
                    inPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NET_RESTORE_TEMPSTRUCT)));
                    NET_RESTORE_TEMPSTRUCT temp = new NET_RESTORE_TEMPSTRUCT() { value = NET_RESTORE.ALL };
                    Marshal.StructureToPtr(temp, inPtr, true);
                    bool ret = NETClient.ControlDevice(m_LoginID, EM_CtrlType.RESTOREDEFAULT, inPtr, 10000);
                    if (!ret)
                    {
                        MessageBox.Show(NETClient.GetLastError());
                        return;
                    }
                }
            }
        }

        private void menu_Upgrade_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero != m_LoginID)
            {
                UpgradeForm upgrade = new UpgradeForm(m_LoginID);
                upgrade.ShowDialog();
                upgrade.Dispose();
            }
            else
            {
                MessageBox.Show("Please login first!(请先登录！)");
            }
        }

        private void menu_AutoMatrix_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero != m_LoginID)
            {
                AutoMatrixForm autoMatrix = new AutoMatrixForm(m_LoginID);
                autoMatrix.ShowDialog();
                autoMatrix.Dispose();
            }
            else
            {
                MessageBox.Show("Please login first!(请先登录！)");
            }
        }

        private void menu_DeviceList_Click(object sender, EventArgs e)
        {
            string fileName = System.Environment.CurrentDirectory+ @"\Pic\device.png";
            try
            {
                Process.Start(fileName);
            }
            catch (Exception ex)
            {
                Console.WriteLine("调用默认看图软件打开失败," + ex.Message);
                try
                {
                    string arg =
                        string.Format(
                            "\"{0}\\Windows Photo Viewer\\PhotoViewer.dll\", ImageView_Fullscreen  {1} ",
                            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)
                            , fileName);
                    var dllExe = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),
                        "rundll32.exe");
                    System.Diagnostics.Process.Start(dllExe, arg);
                }
                catch (Exception exc)
                {
                    //打开文件夹并选中文件
                    var argment = string.Format(@"/select,""{0}""", fileName);
                    System.Diagnostics.Process.Start("Explorer", argment);
                }
            }
        }

        private string AccessDoorOpenMethod2Str(EM_ACCESS_DOOROPEN_METHOD em)
        {
            string strOpenMethod = "UNKNOWN(未知)";
            switch (em)
            {
                case EM_ACCESS_DOOROPEN_METHOD.UNKNOWN:
                    strOpenMethod = "UNKNOWN(未知)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.PWD_ONLY:
                    strOpenMethod = "PWD_ONLY(密码开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.CARD:
                    strOpenMethod = "CARD(刷卡开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.CARD_FIRST:
                    strOpenMethod = "CARD_FIRST(先刷卡后密码)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.PWD_FIRST:
                    strOpenMethod = "PWD_FIRST(先密码后刷卡)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.REMOTE:
                    strOpenMethod = "REMOTE(远程开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.BUTTON:
                    strOpenMethod = "BUTTON(开锁按钮进行开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT:
                    strOpenMethod = "FINGERPRINT(指纹开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.PWD_CARD_FINGERPRINT:
                    strOpenMethod = "PWD_CARD_FINGERPRINT(密码+刷卡+指纹组合开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.PWD_FINGERPRINT:
                    strOpenMethod = "PWD_FINGERPRINT(密码+指纹组合开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.CARD_FINGERPRINT:
                    strOpenMethod = "CARD_FINGERPRINT(刷卡+指纹组合开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.PERSONS:
                    strOpenMethod = "PERSONS(多人开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.KEY:
                    strOpenMethod = "KEY(钥匙开门)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.COERCE_PWD:
                    strOpenMethod = "COERCE_PWD(胁迫密码开门)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.QRCODE:
                    strOpenMethod = "QRCODE(二维码开门)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.FACE_RECOGNITION:
                    strOpenMethod = "FACE_RECOGNITION(目标识别开门)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.FACEIDCARD:
                    strOpenMethod = "FACEIDCARD(人证对比)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.FACEIDCARD_AND_IDCARD:
                    strOpenMethod = "FACEIDCARD_AND_IDCARD(身份证+人证比对)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.BLUETOOTH:
                    strOpenMethod = "BLUETOOTH(蓝牙开门)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.CUSTOM_PASSWORD:
                    strOpenMethod = "CUSTOM_PASSWORD(个性化密码开门)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.USERID_AND_PWD:
                    strOpenMethod = "USERID_AND_PWD(UserID+密码)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.FACE_AND_PWD:
                    strOpenMethod = "FACE_AND_PWD(人脸+密码开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT_AND_PWD:
                    strOpenMethod = "FINGERPRINT_AND_PWD(指纹+密码开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT_AND_FACE:
                    strOpenMethod = "FINGERPRINT_AND_FACE(指纹+人脸开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.CARD_AND_FACE:
                    strOpenMethod = "CARD_AND_FACE(刷卡+人脸开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.FACE_OR_PWD:
                    strOpenMethod = "FACE_OR_PWD(人脸或密码开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT_OR_PWD:
                    strOpenMethod = "FINGERPRINT_OR_PWD(指纹或密码开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT_OR_FACE:
                    strOpenMethod = "FINGERPRINT_OR_FACE(指纹或人脸开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.CARD_OR_FACE:
                    strOpenMethod = "CARD_OR_FACE(刷卡或人脸开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.CARD_OR_FINGERPRINT:
                    strOpenMethod = "CARD_OR_FINGERPRINT(刷卡或指纹开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT_AND_FACE_AND_PWD:
                    strOpenMethod = "FINGERPRINT_AND_FACE_AND_PWD(指纹+人脸+密码开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.CARD_AND_FACE_AND_PWD:
                    strOpenMethod = "CARD_AND_FACE_AND_PWD(刷卡+人脸+密码开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.CARD_AND_FINGERPRINT_AND_PWD:
                    strOpenMethod = "CARD_AND_FINGERPRINT_AND_PWD(刷卡+指纹+密码开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.CARD_AND_PWD_AND_FACE:
                    strOpenMethod = "CARD_AND_PWD_AND_FACE(卡+指纹+人脸组合开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT_OR_FACE_OR_PWD:
                    strOpenMethod = "FINGERPRINT_OR_FACE_OR_PWD(指纹或人脸或密码)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.CARD_OR_FACE_OR_PWD:
                    strOpenMethod = "CARD_OR_FACE_OR_PWD(卡或人脸或密码开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.CARD_OR_FINGERPRINT_OR_FACE:
                    strOpenMethod = "CARD_OR_FINGERPRINT_OR_FACE(卡或指纹或人脸开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.CARD_AND_FINGERPRINT_AND_FACE_AND_PWD:
                    strOpenMethod = "CARD_AND_FINGERPRINT_AND_FACE_AND_PWD(卡+指纹+人脸+密码组合开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.CARD_OR_FINGERPRINT_OR_FACE_OR_PWD:
                    strOpenMethod = "CARD_OR_FINGERPRINT_OR_FACE_OR_PWD(卡或指纹或人脸或密码开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.FACEIPCARDANDIDCARD_OR_CARD_OR_FACE:
                    strOpenMethod = "FACEIPCARDANDIDCARD_OR_CARD_OR_FACE((身份证+人证比对)或刷卡或人脸)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.FACEIDCARD_OR_CARD_OR_FACE:
                    strOpenMethod = "FACEIDCARD_OR_CARD_OR_FACE(人证比对或刷卡(二维码)或人脸)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.DTMF:
                    strOpenMethod = "DTMF(DTMF开锁)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.REMOTE_QRCODE:
                    strOpenMethod = "REMOTE_QRCODE(远程二维码开门)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.REMOTE_FACE:
                    strOpenMethod = "REMOTE_FACE(远程人脸开门)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.CITIZEN_FINGERPRINT:
                    strOpenMethod = "CITIZEN_FINGERPRINT(人证比对开门(指纹))";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.TEMPORARY_PASSWORD:
                    strOpenMethod = "TEMPORARY_PASSWORD(临时密码开门)";
                    break;
                case EM_ACCESS_DOOROPEN_METHOD.HEALTHCODE:
                    strOpenMethod = "HEALTHCODE(健康码开门)";
                    break;
                default:
                    strOpenMethod = "UNKNOWN(未知)";
                    break;
            }
            return strOpenMethod;
        }

        private void GetAccessCount()
        {
            m_AccessCount = 0;

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
                m_AccessCount = stuOut.stuACCaps.nChannels;
            }
            else
            {
                m_AccessCount = 4;
                //MessageBox.Show(NETClient.GetLastError());
            }
        }

        private void btn_OpenEvent_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero != m_LoginID)
            {
                OpenDoorEventForm openDoorForm = new OpenDoorEventForm(m_LoginID, m_AccessCount);
                openDoorForm.ShowDialog();
                openDoorForm.Dispose();
            }
            else
            {
                MessageBox.Show("Please login first!(请先登录！)");
            }
        }
    }

    public class AlarmInfo
    {
        public EM_ALARM_TYPE AlarmType { get; set; }
        public Int64 ID { get; set; }
        public string Time { get; set; }
        public int Channel { get; set; }
        public string Message { get; set; }
        public int Status { get; set; }
    }
}
