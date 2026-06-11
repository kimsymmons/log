import { getServerDb } from './db'
import { createApp } from './index'

const port = Number(process.env.PORT ?? 3001)
const db = getServerDb()
const app = createApp(db)

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})
