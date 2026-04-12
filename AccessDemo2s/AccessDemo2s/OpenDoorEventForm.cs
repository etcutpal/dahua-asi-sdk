using NetSDKCS;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace AccessDemo2s
{
    public partial class OpenDoorEventForm : Form
    {
        private IntPtr m_LoginID = IntPtr.Zero;
        private IntPtr m_RealLoadID = IntPtr.Zero;
        private int m_Channel = 0;
        private int m_ID = 1;

        private static fAnalyzerDataCallBack m_AnalyzerDataCallBack;

        public OpenDoorEventForm()
        {
            InitializeComponent();
        }

        public OpenDoorEventForm(IntPtr loginid, int channel)
        {
            InitializeComponent();
            if (IntPtr.Zero != loginid)
            {
                m_LoginID = loginid;
            }
            m_Channel = channel;
        }

        private void OpenDoorEventForm_Load(object sender, EventArgs e)
        {
            m_AnalyzerDataCallBack = new fAnalyzerDataCallBack(AnalyzerDataCallBack);
            channel_comboBox.Items.Clear();
            if (m_Channel > 0)
            {
                for (int i = 1; i <= m_Channel; i++)
                {
                    channel_comboBox.Items.Add(i);
                }
                channel_comboBox.SelectedIndex = 0;
            }
        }

        private void btn_RealLoad_Click(object sender, EventArgs e)
        {
            if (IntPtr.Zero == m_RealLoadID)
            {
                m_ID = 1;
                m_RealLoadID = NETClient.RealLoadPicture(m_LoginID, 0, (uint)EM_EVENT_IVS_TYPE.ALL, true, m_AnalyzerDataCallBack, m_LoginID, IntPtr.Zero);
                if (IntPtr.Zero == m_RealLoadID)
                {
                    MessageBox.Show(this, NETClient.GetLastError());
                    return;
                }
                btn_RealLoad.Text = "StopLoadEvent(取消监听)";
            }
            else
            {
                bool ret = NETClient.StopLoadPic(m_RealLoadID);
                if (!ret)
                {
                    m_RealLoadID = IntPtr.Zero;
                    MessageBox.Show(this, NETClient.GetLastError());
                    return;
                }
                m_RealLoadID = IntPtr.Zero;
                btn_RealLoad.Text = "RealLoadEvent(监听智能事件)";
                listView_realLoadEvent.Items.Clear();
                pictureBox_image.Image = null;
                pictureBox_image.Refresh();
                pictureBox_faceimage.Image = null;
                pictureBox_faceimage.Refresh();
                pictureBox_candidateimage.Image = null;
                pictureBox_candidateimage.Refresh();
            }
        }


        /// <summary>
        /// event data callback
        /// 事件数据回调函数
        /// </summary>
        /// <param name="lAnalyzerHandle">analyzerHandle:RealLoadPicture returns value 事件句柄</param>
        /// <param name="dwEventType">event type,see EM_EVENT_IVS_TYPE 事件类型</param>
        /// <param name="pEventInfo">event information 事件信息</param>
        /// <param name="pBuffer">picture buffer 数据缓存</param>
        /// <param name="dwBufSize">picture buffer size 数据缓存大小</param>
        /// <param name="dwUser">user data from RealLoadPicture function 用户数据</param>
        /// <param name="nSequence">means status of the same uploaded image, when it is 0, it appears first time.When it is 2, it appears last time or appears once.When it is 1, it will appear again. 序列号</param>
        /// <param name="reserved">int nState = (int) reserved means current callback data status;when it is 1, it means current data is real time and current callback data is offline;when it is 2,it means offline data send structure 保留</param>
        /// <returns>reserved 保留</returns>
        private int AnalyzerDataCallBack(IntPtr lAnalyzerHandle, uint dwEventType, IntPtr pEventInfo, IntPtr pBuffer, uint dwBufSize, IntPtr dwUser, int nSequence, IntPtr reserved)
        {
            switch (dwEventType)
            {
                case (uint)EM_EVENT_IVS_TYPE.ACCESS_CTL:     // Access control event 门禁事件
                    {
                        NET_DEV_EVENT_ACCESS_CTL_INFO info = (NET_DEV_EVENT_ACCESS_CTL_INFO)Marshal.PtrToStructure(pEventInfo, typeof(NET_DEV_EVENT_ACCESS_CTL_INFO));

                        var list_item = new ListViewItem();
                        list_item.Text = info.szUserID;
                        list_item.SubItems.Add(info.szCardNo);
                        if (!info.UTC.dwYear.Equals(0) && !info.UTC.dwMonth.Equals(0) && !info.UTC.dwDay.Equals(0))
                        {
                            list_item.SubItems.Add(info.UTC.ToString());
                        }
                        else
                        {
                            list_item.SubItems.Add(info.stuFileInfo.stuFileTime.ToString());
                        }

                        StringBuilder infoBuilder = new StringBuilder()
                            .Append("Channel:").Append(info.nChannelID).Append(",")
                            .Append("Method:");
                        switch (info.emOpenMethod)
                        {
                            case EM_ACCESS_DOOROPEN_METHOD.CARD:
                                infoBuilder.Append("Card(卡),");
                                break;
                            case EM_ACCESS_DOOROPEN_METHOD.FACE_RECOGNITION:
                                infoBuilder.Append("TargetRecognition(目标识别),");
                                break;
                            case EM_ACCESS_DOOROPEN_METHOD.FINGERPRINT:
                                infoBuilder.Append("Fingerprint(指纹),");
                                break;
                            case EM_ACCESS_DOOROPEN_METHOD.REMOTE:
                                infoBuilder.Append("Remote(远程),");
                                break;
                            default:
                                infoBuilder.Append("Unknown(未知),");
                                break;
                        }
                        infoBuilder.Append("Status:");
                        if (info.bStatus)
                        {
                            infoBuilder.Append("True(成功)");
                        }
                        else
                        {
                            infoBuilder.Append("False(失败)");
                        }
                        list_item.SubItems.Add(infoBuilder.ToString());

                        this.BeginInvoke(new Action(() =>
                        {
                            listView_realLoadEvent.BeginUpdate();
                            listView_realLoadEvent.Items.Add(list_item);
                            listView_realLoadEvent.EndUpdate();

                            pictureBox_image.Image = null;
                            pictureBox_image.Refresh();
                            pictureBox_faceimage.Image = null;
                            pictureBox_faceimage.Refresh();
                            pictureBox_candidateimage.Image = null;
                            pictureBox_candidateimage.Refresh();

                            //大图
                            if (IntPtr.Zero != pBuffer && dwBufSize > 0)
                            {
                                byte[] pic = new byte[dwBufSize];
                                Marshal.Copy(pBuffer, pic, 0, (int)dwBufSize);

                                using (MemoryStream stream = new MemoryStream(pic))
                                {
                                    try
                                    {
                                        Image image = Image.FromStream(stream);
                                        this.pictureBox_image.Image = image;
                                        this.pictureBox_image.Refresh();
                                        this.pictureBox_image.Visible = true;
                                    }
                                    catch (Exception e)
                                    {
                                        Console.WriteLine(e);
                                    }
                                }
                            }

                            for (int i = 0; i < info.nImageInfoCount; i++)
                            {
                                // 人脸抠图
                                if (info.stuImageInfo[i].emType == EM_ACCESS_CTL_IMAGE_TYPE.FACE)
                                {
                                    byte[] personFaceInfo = new byte[info.stuImageInfo[i].nLength];
                                    Marshal.Copy(IntPtr.Add(pBuffer, (int)info.stuImageInfo[i].nOffSet), personFaceInfo, 0, (int)info.stuImageInfo[i].nLength);
                                    using (MemoryStream stream = new MemoryStream(personFaceInfo))
                                    {
                                        try // add try catch for catch exception when the stream is not image format,and the stream is from device.
                                        {
                                            Image faceImage = Image.FromStream(stream);
                                            pictureBox_faceimage.Image = faceImage;
                                        }
                                        catch (Exception ex)
                                        {
                                            Console.WriteLine(ex);
                                        }
                                    }
                                }

                                // 人脸数据库底图
                                if (info.stuImageInfo[i].emType == EM_ACCESS_CTL_IMAGE_TYPE.LOCAL)
                                {
                                    byte[] personFaceInfo = new byte[info.stuImageInfo[i].nLength];
                                    Marshal.Copy(IntPtr.Add(pBuffer, (int)info.stuImageInfo[i].nOffSet), personFaceInfo, 0, (int)info.stuImageInfo[i].nLength);
                                    using (MemoryStream stream = new MemoryStream(personFaceInfo))
                                    {
                                        try // add try catch for catch exception when the stream is not image format,and the stream is from device.
                                        {
                                            Image faceImage = Image.FromStream(stream);
                                            pictureBox_candidateimage.Image = faceImage;
                                        }
                                        catch (Exception ex)
                                        {
                                            Console.WriteLine(ex);
                                        }
                                    }
                                }
                            }
                        }));
                    }
                    break;
                default:
                    Console.WriteLine("Other realLoad event received:" + Enum.GetName(typeof(EM_EVENT_IVS_TYPE), dwEventType));
                    break;
            }

            return 1;
        }

        private void OpenDoorEventForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            try
            {
                if (IntPtr.Zero != m_RealLoadID)
                {
                    NETClient.StopLoadPic(m_RealLoadID);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
            }
        }
    }
}
