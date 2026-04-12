using NetSDKCS;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace AccessDemo2s
{
    public partial class UserCardInfoForm : Form
    {
        private IntPtr m_LoginID = IntPtr.Zero;
        private EM_OperateType m_OperateType = EM_OperateType.Add;
        private NET_ACCESS_CARD_INFO m_CardInfo = new NET_ACCESS_CARD_INFO();

        public UserCardInfoForm()
        {
            InitializeComponent();
        }

        public UserCardInfoForm(IntPtr loginid, EM_OperateType type, NET_ACCESS_CARD_INFO info)
        {
            InitializeComponent();
            m_LoginID = loginid;
            m_OperateType = type;
            m_CardInfo = info;
        }

        private void btn_Confirm_Click(object sender, EventArgs e)
        {
            bool result = false;
            NET_ACCESS_CARD_INFO[] stuInArray = new NET_ACCESS_CARD_INFO[1] { m_CardInfo };
            NET_EM_FAILCODE[] stuOutErrArray = new NET_EM_FAILCODE[1];

            stuInArray[0].emType = (EM_ACCESSCTLCARD_TYPE)cmb_CardType.SelectedIndex;
            if (m_OperateType == EM_OperateType.Modify)
            {
                result = NETClient.UpdateOperateAccessCardService(m_LoginID, stuInArray, out stuOutErrArray, 3000);
                if (!result)
                {
                    for (int i = 0; i < stuOutErrArray.Length; i++)
                    {
                        MessageBox.Show(GetFailCodeMsg(stuOutErrArray[i].emCode));
                    }
                }
            }
            else
            {
                stuInArray[0].szCardNo = txt_CardNum.Text;
                result = NETClient.InsertOperateAccessCardService(m_LoginID, stuInArray, out stuOutErrArray, 5000);
                if (!result)
                {
                    for (int i = 0; i < stuOutErrArray.Length; i++)
                    {
                        MessageBox.Show(GetFailCodeMsg(stuOutErrArray[i].emCode));
                    }
                }
            }

            Close();
        }

        private void btn_Cancel_Click(object sender, EventArgs e)
        {
            Close();
        }

        private void UserCardInfoForm_Load(object sender, EventArgs e)
        {
            if (m_OperateType == EM_OperateType.Modify)
            {
                txt_CardNum.ReadOnly = true;
                txt_CardNum.Text = m_CardInfo.szCardNo;
                cmb_CardType.SelectedIndex = (int)m_CardInfo.emType;
            }
            else
            {
                txt_CardNum.ReadOnly = false;
            }
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
