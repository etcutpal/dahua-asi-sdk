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
    public partial class UserManageFrom : Form
    {
        private IntPtr m_LoginID = IntPtr.Zero;
        private int m_Channel = 0;

        private IntPtr m_FindUserID = IntPtr.Zero;
        private List<NET_ACCESS_USER_INFO> userInfoList = new List<NET_ACCESS_USER_INFO>();
        private int QueryNum = 10;

        public UserManageFrom()
        {
            InitializeComponent();
        }

        public UserManageFrom(IntPtr loginid, int channel)
        {
            InitializeComponent();
            if (IntPtr.Zero != loginid)
            {
                m_LoginID = loginid;
            }
            m_Channel = channel;
        }

        private void UserManageFrom_Load(object sender, EventArgs e)
        {
            GetAllUser();
        }

        private void btn_Get_Click(object sender, EventArgs e)
        {
            GetAllUser();
        }

        private void btn_Add_Click(object sender, EventArgs e)
        {
            UserInfoForm userInfo = new UserInfoForm(m_LoginID, EM_OperateType.Add, new NET_ACCESS_USER_INFO(), m_Channel);
            userInfo.ShowDialog();
            userInfo.Dispose();
            GetAllUser();
        }

        private void btn_Modify_Click(object sender, EventArgs e)
        {
            if (dataGridView_user.SelectedRows.Count == 0)
            {
                MessageBox.Show("Please select one user!(请选择一个用户！)");
                return;
            }
            string user_ID = dataGridView_user.SelectedRows[0].Cells[1].Value.ToString();

            var infolist = userInfoList.Where(a => a.szUserID==user_ID).ToList();
            if (infolist.Count != 1)
            {
                MessageBox.Show("The select data is error!(选择的数据出错！)");
                return;
            }
            var select_user_info = infolist[0];
            UserInfoForm userInfo = new UserInfoForm(m_LoginID, EM_OperateType.Modify, select_user_info, m_Channel);
            userInfo.ShowDialog();
            userInfo.Dispose();
            GetAllUser();
        }

        private void btn_Delete_Click(object sender, EventArgs e)
        {
            if (dataGridView_user.SelectedRows.Count == 0)
            {
                MessageBox.Show("Please select one user!(请选择一个用户！)");
                return;
            }
            string user_ID = dataGridView_user.SelectedRows[0].Cells[1].Value.ToString();

            var infolist = userInfoList.Where(a => a.szUserID == user_ID).ToList();
            if (infolist.Count != 1)
            {
                MessageBox.Show("The select data is error!(选择的数据出错！)");
                return;
            }
            var select_user_info = infolist[0];
            NET_EM_FAILCODE[] stuOutErrArray = new NET_EM_FAILCODE[1];
            string[] InUserid = new string[] { select_user_info.szUserID };
            bool result = NETClient.RemoveOperateAccessUserService(m_LoginID, InUserid, out stuOutErrArray, 3000);
            if (!result)
            {
                for (int i = 0; i < stuOutErrArray.Length; i++)
                {
                    MessageBox.Show(GetFailCodeMsg(stuOutErrArray[i].emCode));
                }
            }
            GetAllUser();
        }

        private void GetAllUser()
        {
            NET_IN_USERINFO_START_FIND stuStartIn = new NET_IN_USERINFO_START_FIND();
            stuStartIn.dwSize = (uint)Marshal.SizeOf(typeof(NET_IN_USERINFO_START_FIND));

            NET_OUT_USERINFO_START_FIND stuStartOut = new NET_OUT_USERINFO_START_FIND();
            stuStartOut.dwSize = (uint)Marshal.SizeOf(typeof(NET_OUT_USERINFO_START_FIND));
            stuStartOut.nTotalCount = 0;
            stuStartOut.nCapNum = 50;
            m_FindUserID = NETClient.StartFindUserInfo(m_LoginID, ref stuStartIn, ref stuStartOut, 5000);
            if (IntPtr.Zero == m_FindUserID)
            {
                MessageBox.Show(NETClient.GetLastError());
                return;
            }

            userInfoList.Clear();

            NET_IN_USERINFO_DO_FIND stuFindIn = new NET_IN_USERINFO_DO_FIND();
            stuFindIn.dwSize = (uint)Marshal.SizeOf(typeof(NET_IN_USERINFO_DO_FIND));
            stuFindIn.nCount = QueryNum;

            NET_OUT_USERINFO_DO_FIND stuFindOut = new NET_OUT_USERINFO_DO_FIND();
            stuFindOut.dwSize = (uint)Marshal.SizeOf(typeof(NET_OUT_USERINFO_DO_FIND));
            stuFindOut.nMaxNum = QueryNum;

            NET_ACCESS_USER_INFO[] stuOutUserInfo = new NET_ACCESS_USER_INFO[stuFindOut.nMaxNum];
            IntPtr outInfo = IntPtr.Zero;
            outInfo = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NET_ACCESS_USER_INFO)) * stuFindOut.nMaxNum);
            for (int index = 0; index < stuFindOut.nMaxNum; index++)
            {
                IntPtr outInfoIndex = outInfo + index * Marshal.SizeOf(typeof(NET_ACCESS_USER_INFO));
                if (stuOutUserInfo[index].GetType() == typeof(NET_ACCESS_USER_INFO))                            //if obj is boxinged type of typeName, some param(ex. dwsize) need trans to unmanaged memory
                {
                    Marshal.StructureToPtr(stuOutUserInfo[index], outInfoIndex, true);
                }
                else
                {
                    for (int i = 0; i < Marshal.SizeOf(typeof(NET_ACCESS_USER_INFO)); i++)
                    {
                        Marshal.WriteByte(outInfoIndex, i, 0);
                    }
                }
            }
            stuFindOut.pstuInfo = outInfo;

            int startNum = 0;
            while (true)
            {
                stuFindIn.nStartNo = startNum;

                bool result = NETClient.DoFindUserInfo(m_FindUserID, ref stuFindIn, ref stuFindOut, 5000);
                if (!result)
                {
                    break;
                }

                if (stuFindOut.nRetNum > 0)
                {
                    startNum += stuFindOut.nRetNum;
                    for (int i = 0; i < stuFindOut.nRetNum; i++)
                    {
                        var userinfo = (NET_ACCESS_USER_INFO)Marshal.PtrToStructure(IntPtr.Add(stuFindOut.pstuInfo, Marshal.SizeOf(typeof(NET_ACCESS_USER_INFO)) * i), typeof(NET_ACCESS_USER_INFO));
                        userInfoList.Add(userinfo);
                    }
                }
            }

            NETClient.StopFindUserInfo(m_FindUserID);
			
            ShowInGridView();
        }

        private void ShowInGridView()
        {
            this.BeginInvoke(new Action(() =>
            {
                dataGridView_user.Rows.Clear();
                int index = 0;
                foreach (var item in userInfoList)
                {
                    index++;
                    DataGridViewRow row = new DataGridViewRow();
                    DataGridViewTextBoxCell cell1 = new DataGridViewTextBoxCell();
                    cell1.Value = index.ToString();
                    row.Cells.Add(cell1);
                    DataGridViewTextBoxCell cell2 = new DataGridViewTextBoxCell();
                    cell2.Value = item.szUserID;
                    row.Cells.Add(cell2);
                    DataGridViewTextBoxCell cell3 = new DataGridViewTextBoxCell();
                    cell3.Value = item.szName;
                    row.Cells.Add(cell3);
                    DataGridViewTextBoxCell cell4 = new DataGridViewTextBoxCell();
                    string value = "";
                    switch (item.emUserType)
                    {
                        case EM_USER_TYPE.NORMAL:
                            value = "NORMAL(普通)";
                            break;
                        case EM_USER_TYPE.BLACKLIST:
                            value = "BlockList(禁用名单卡)";
                            break;
                        case EM_USER_TYPE.GUEST:
                            value = "GUEST(来宾卡)";
                            break;
                        case EM_USER_TYPE.PATROL:
                            value = "PATROL(巡逻卡)";
                            break;
                        case EM_USER_TYPE.VIP:
                            value = "VIP(VIP卡)";
                            break;
                        case EM_USER_TYPE.HANDICAP:
                            value = "HANDICAP(残障卡)";
                            break;
                        case EM_USER_TYPE.CUSTOM1:
                            value = "CUSTOM1(自定义用户1)";
                            break;
                        case EM_USER_TYPE.CUSTOM2:
                            value = "CUSTOM2(自定义用户2)";
                            break;
                        case EM_USER_TYPE.UNKNOWN:
                            value = "UNKNOWN(未知用户)";
                            break;
                        default:
                            value = "UNKNOWN(未知用户)";
                            break;
                    }
                    cell4.Value = value;
                    row.Cells.Add(cell4);

                    dataGridView_user.Rows.Add(row);
                }

            }));
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
