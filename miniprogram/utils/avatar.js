// 把 cloud:// fileID 解析成可直接渲染的 https tempFileURL
// 空 / 已是 http(s) / 本地路径都原样返回；cloud 协议才走 getTempFileURL
function resolveAvatarSrc(fileID) {
  if (!fileID) return Promise.resolve('')
  if (!/^cloud:\/\//.test(fileID)) return Promise.resolve(fileID)
  return new Promise(function (resolve) {
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: function (res) {
        var item = res && res.fileList && res.fileList[0]
        var url = item && item.tempFileURL
        if (item && item.status !== 0) {
          console.warn('[avatar] getTempFileURL non-zero status:', item.status, item.errMsg)
        }
        resolve(url || '')
      },
      fail: function (err) {
        console.warn('[avatar] getTempFileURL failed:', err && err.errMsg)
        resolve('')
      }
    })
  })
}

module.exports = {
  resolveAvatarSrc: resolveAvatarSrc
}
