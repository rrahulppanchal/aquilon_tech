import { readFileSync, writeFileSync } from "node:fs"
import { parse } from "csv-parse/sync"
import { normalizeRate } from "../features/rates/domain/normalize"
import { normalizeCustomers } from "../features/customers/domain/matching"
const readCsv = (path: string) =>
  parse(readFileSync(path, "utf8"), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
  }) as Record<string, string>[]
const samples = [
  "1-okafor-driveway",
  "2-greenway-car-park",
  "3-kestrel-row-patio",
].map((name, i) => ({
  id: name,
  title: [
    "Driveway extension",
    "Car park resurfacing",
    "Patio & channel drain",
  ][i],
  label: ["Patience Okafor", "Greenway Care Homes", "Kestrel Row Lettings"][i],
  text: readFileSync(`data/fixtures/enquiries/${name}.txt`, "utf8"),
}))
writeFileSync(
  "data/seed.json",
  JSON.stringify(
    {
      rates: readCsv("data/fixtures/rates.csv").map(normalizeRate),
      customers: normalizeCustomers(readCsv("data/fixtures/customers.csv")),
      samples,
    },
    null,
    2
  )
)
