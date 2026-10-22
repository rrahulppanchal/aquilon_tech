import type { QuoteLine } from "@/features/quotes/types"
type Layer = {
  key: string
  className: string
  height: number
  label: string
  code?: string
}
const finishes: Record<
  string,
  { className: string; height: number; label: string }
> = {
  BP01: { className: "layer-blocks", height: 26, label: "Block paving" },
  BP03: {
    className: "layer-blocks",
    height: 26,
    label: "Block paving, customer-supplied blocks",
  },
  PT01: { className: "layer-slabs", height: 18, label: "Sandstone slabs" },
  PT02: { className: "layer-slabs", height: 18, label: "Porcelain slabs" },
  PT03: {
    className: "layer-slabs",
    height: 18,
    label: "Patio slabs, customer-supplied",
  },
  TM01: { className: "layer-tarmac", height: 22, label: "Tarmac surface" },
  TM02: { className: "layer-tarmac", height: 22, label: "Tarmac overlay" },
}
const number = (n: number) =>
  n.toLocaleString("en-GB", { maximumFractionDigits: 2 })
/* Draws the job's build-up from the lines that are actually in scope, so a
   reviewer can see at a glance what is being dug, laid and charged. */
export function BuildUp({ lines }: { lines: QuoteLine[] }) {
  const inScope = lines.filter((l) => !l.excluded && l.code)
  const line = (code: string) => inScope.find((l) => l.code === code)
  const finishLine = inScope.find((l) => l.code && finishes[l.code])
  if (!finishLine) return null
  const finish = finishes[finishLine.code!]
  const layers: Layer[] = [{ key: "finish", ...finish, code: finishLine.code! }]
  if (line("SB01"))
    layers.push({
      key: "type1",
      className: "layer-type1",
      height: 58,
      label: "Type 1 sub-base, 150 mm compacted",
      code: "SB01",
    })
  if (line("SB04"))
    layers.push({
      key: "membrane",
      className: "layer-membrane",
      height: 8,
      label: "Membrane",
      code: "SB04",
    })
  const dug = layers.reduce((sum, l) => sum + l.height + 1, 0)
  const ex = line("EX01"),
    extra = line("EX02"),
    concrete = line("EX04")
  const depth = concrete ? "150 mm" : extra ? "250 mm" : ex ? "150 mm" : null
  const groundLabel = concrete
    ? "Old concrete broken out, up to 150 mm"
    : [ex && "Topsoil dug out", extra && "plus 100 mm extra depth"]
        .filter(Boolean)
        .join(", ") || "Existing ground"
  layers.push({
    key: "ground",
    className: concrete ? "layer-concrete" : "layer-dig",
    height: 34,
    label: groundLabel,
    code: concrete
      ? "EX04"
      : [ex && "EX01", extra && "EX02"].filter(Boolean).join(" + ") ||
        undefined,
  })
  const kerb = line("KB01"),
    drain = line("DR01")
  const area = finishLine.quantity
  return (
    <figure className="buildup" aria-labelledby="buildup-title">
      <div className="buildup-head">
        <h2 id="buildup-title">Build-up</h2>
        <p>Drawn from the items in scope. Excluded items drop out.</p>
      </div>
      <div className="buildup-drawing">
        <div
          className="buildup-dim"
          style={{ height: dug, alignSelf: "start" }}
          aria-hidden={!depth}
        >
          {depth && (
            <span>
              {depth}
              <small>dig</small>
            </span>
          )}
        </div>
        <div className="buildup-layers" aria-hidden="true">
          {layers.map((layer) => (
            <div
              key={layer.key}
              className={`layer ${layer.className}`}
              style={{ height: layer.height }}
            />
          ))}
        </div>
        <ul className="buildup-labels">
          {layers.map((layer) => (
            <li key={layer.key} style={{ height: layer.height + 1 }}>
              {layer.code && <span className="code">{layer.code}</span>}
              <span>{layer.label}</span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="buildup-extras">
        <span>
          Area{" "}
          <strong>{area === null ? "to confirm" : `${number(area)} m²`}</strong>
        </span>
        {kerb && (
          <span>
            Edging kerbs{" "}
            <strong>
              {kerb.quantity === null
                ? "length to confirm"
                : `${number(kerb.quantity)} m`}
            </strong>
          </span>
        )}
        {drain && (
          <span>
            Channel drain{" "}
            <strong>
              {drain.quantity === null
                ? "length to confirm"
                : `${number(drain.quantity)} m`}
            </strong>
          </span>
        )}
        {depth && (
          <span>
            Dig depth <strong>about {depth}</strong>
          </span>
        )}
      </figcaption>
    </figure>
  )
}
