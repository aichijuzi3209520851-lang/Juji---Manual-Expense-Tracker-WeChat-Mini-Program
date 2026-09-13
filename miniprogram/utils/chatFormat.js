// 判断小橘的回复里是否包含代码，用于在聊天气泡中切换为「等宽 + 更宽」的排版。
// 纯展示层判断，误判只会影响排版，不影响内容正确性。

// 常见语言的关键字 / 预处理指令 / 函数调用特征（行首出现）
const CODE_HINT_PATTERN = /(^|\n)\s*(#include|#define|#import|#pragma|import\s|from\s|package\s|def\s|function\s|class\s|public\s|private\s|static\s|void\s|int\s|char\s|float\s|double\s|bool\s|let\s|const\s|var\s|return\s|for\s*\(|while\s*\(|if\s*\(|switch\s*\(|std::|console\.log|printf\s*\()/

/**
 * 粗略判断一段文本是否像代码
 * 规则：至少 3 行，且命中关键字特征 / 以分号或左花括号结尾的行
 * @param {string} text
 * @returns {boolean}
 */
function looksLikeCode(text) {
  const str = String(text || '')
  if (!str) return false
  if (str.split('\n').length < 3) return false
  if (CODE_HINT_PATTERN.test(str)) return true
  return /;\s*\n/.test(str) || /\{\s*\n/.test(str)
}

module.exports = { looksLikeCode }
