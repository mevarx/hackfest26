import GhostTwinPanel from '../components/GhostTwinPanel.jsx'

export default function GhostTwinPanelPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-teal">
        Stage 04 · Audit
      </p>
      <h1 className="mt-3 font-serif text-4xl leading-[1.02] tracking-[-0.03em] text-navy sm:text-5xl">
        Challenge every score
        <span className="block italic text-navy/55">
          before a human decides.
        </span>
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-navy/65">
        Edit Kavya&rsquo;s profile attribute by attribute and re-run the counterfactual
        audit. In fair mode nothing moves; in simulated legacy mode every pedigree
        attribute drags the score.
      </p>
      <div className="mt-8">
        <GhostTwinPanel />
      </div>
    </div>
  )
}
