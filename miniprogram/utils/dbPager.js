const DEFAULT_PAGE_SIZE = 20
const DEFAULT_MAX = 10000

async function getAll(query, pageSize = DEFAULT_PAGE_SIZE, max = DEFAULT_MAX) {
  const all = []
  const size = Math.max(1, Math.min(pageSize, max))

  for (let offset = 0; offset < max;) {
    const { data = [] } = await query
      .skip(offset)
      .limit(Math.min(size, max - offset))
      .get()

    if (!data.length) break
    all.push(...data)
    if (data.length < size) break
    offset += data.length
  }

  return all
}

module.exports = {
  getAll
}
