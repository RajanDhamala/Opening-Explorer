import fs from "fs/promises"
import axios from "axios"
import path from "path"

// const gameData = await axios.get(item)
//   console.log("archive:", index, item, "year:", year, "month:", month)
//   await fs.writeFile(`${name}-${year}-${month}`, JSON.stringify(gameData.data, null, 2))

const fetchArchives = async (req, res) => {
  const name = "i_use_nvim_btw"
  const filePath = path.join("MockApi", name, "base.json")
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  try {
    const data = await fs.readFile(filePath, "utf-8")
    const jsonData = JSON.parse(data)
    return res.status(200).json({
      "data": jsonData,
      message: "from the cache"
    })

  } catch (error) {
    const content = await axios.get(`https://api.chess.com/pub/player/${name}/games/archives`)
    console.log("api invoked", content.status)
    if (content.status == "200") {
      await fs.writeFile(filePath, JSON.stringify(content.data, null, 2), "utf-8")
      return res.status(200).json({
        message: "updated the cache",
        data: content.data
      })
    } else {
      return res.status(400).json({
        message: "failed to update cache"
      })
    }
  }
}


const fetchMonthGame = async (req, res) => {
  const { year, month } = req.params

  const name = "i_use_nvim_btw"

  if (!year || !month) {
    return res.status(400).json({ message: "invalid params" })
  }

  const folderPath = path.join("MockApi", name)
  const baseFilePath = path.join(folderPath, "base.json")
  const monthFilePath = path.join(folderPath, `${name}-${year}-${month}.json`)

  try {
    await fs.mkdir(folderPath, { recursive: true })

    const baseData = await fs.readFile(baseFilePath, "utf-8")
    const jsonData = JSON.parse(baseData)

    const endpoint = `https://api.chess.com/pub/player/${name}/games/${year}/${month}`

    if (!jsonData.archives.includes(endpoint)) {
      return res.status(404).json({ message: "archive not found in base.json" })
    }

    let monthData
    try {
      const fileContent = await fs.readFile(monthFilePath, "utf-8")
      monthData = JSON.parse(fileContent)
      console.log("Loaded month data from cache")
    } catch {
      console.log("Cache miss: fetching from API")
      const response = await axios.get(endpoint)
      monthData = response.data

      await fs.writeFile(monthFilePath, JSON.stringify(monthData, null, 2), "utf-8")
      console.log("Saved month data:", monthFilePath)
    }

    return res.status(200).json({
      message: "got the month data",
      data: monthData
    })
  } catch (error) {
    console.error("Error fetching month game:", error)
    return res.status(500).json({ message: "failed to fetch month data" })
  }
}


export {
  fetchArchives, fetchMonthGame
}
