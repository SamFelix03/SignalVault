import 'dotenv/config'
import { createMarketsExchange } from '../src/services/markets-exchange.js'

async function main() {
  const follower = process.argv[2] ?? '0x6C8011a929164485c3aED93433E7363Fcb990b97'
  const ex = await createMarketsExchange()
  const fills = await ex.client.getUserFills(follower, { limit: 20 })
  console.log(JSON.stringify(fills, null, 2))
}

main().catch(console.error)
