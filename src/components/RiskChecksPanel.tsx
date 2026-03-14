import type { AiPanelData, RiskChecksInputsConfig } from "../types";

interface Props {
  data: AiPanelData;
  inputs: RiskChecksInputsConfig;
  onInputChange: (key: keyof RiskChecksInputsConfig, value: boolean) => void;
  onBulkChange: (value: boolean) => void;
}

const tone = (value: string): string => {
  if (["PASS", "LOW"].includes(value)) return "border-[#6f765f] bg-[#1f251b] text-[#d8decf]";
  if (["WATCH", "MED", "MODERATE"].includes(value)) return "border-[#7a6840] bg-[#2a2418] text-[#e7d9b3]";
  return "border-[#704844] bg-[#271a19] text-[#d6b3af]";
};

const switchTrackClass = (on: boolean) =>
  `relative inline-flex h-5 w-9 items-center rounded-full border transition ${
    on
      ? "border-[#8b4f4f] bg-[#291818]"
      : "border-white/15 bg-[#17191d]"
  }`;

const switchThumbClass = (on: boolean) =>
  `inline-block h-3.5 w-3.5 transform rounded-full transition ${
    on ? "translate-x-[18px] bg-[#e0b7b7]" : "translate-x-[3px] bg-[#7b7f87]"
  }`;

const buttonTone = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-semibold transition ${
    active
      ? "border-[#F5C542]/70 bg-[#2b2417] text-[#F5C542]"
      : "border-white/15 bg-[#111215] text-[#BFC2C7] hover:bg-[#17191d]"
  }`;

const labelToKey: Record<string, keyof RiskChecksInputsConfig> = {
  "Risk Gate": "riskGate",
  "Execution Certainty": "executionCertainty",
  "Stress Filter": "stressFilter",
};

export const RiskChecksPanel = ({ data, inputs, onInputChange, onBulkChange }: Props) => {
  const allOn = Object.values(inputs).every(Boolean);
  const someOff = Object.values(inputs).some((value) => !value);
  const cards = data.riskChecks
    .map((check) => ({ ...check, key: labelToKey[check.label] }))
    .filter((check): check is typeof check & { key: keyof RiskChecksInputsConfig } => Boolean(check.key));

  const sizeStatus = data.sizeHint === "0" ? "BLOCK" : "PASS";

  return (
    <section className="rounded-2xl border border-white/10 bg-[#121316] p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs uppercase tracking-widest text-[#6B6F76]">Risk Checks</h3>
        <div className="flex gap-2">
          <button type="button" className={buttonTone(allOn)} onClick={() => onBulkChange(true)}>
            All ON
          </button>
          <button type="button" className={buttonTone(someOff)} onClick={() => onBulkChange(false)}>
            All OFF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
        {cards.map((check) => {
          const included = inputs[check.key];
          return (
            <article
              key={check.label}
              className={`rounded-xl border p-3 transition ${
                included
                  ? "border-[#8b4f4f]/35 bg-[linear-gradient(180deg,#171011_0%,#0F1012_100%)]"
                  : "border-white/10 bg-[#0F1012]"
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-sm text-white">{check.label}</p>
                <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${tone(check.status)}`}>{check.status}</span>
              </div>
              <p className="min-h-[36px] text-xs text-[#6B6F76]">{check.detail}</p>
              <button
                type="button"
                aria-pressed={included}
                onClick={() => onInputChange(check.key, !included)}
                className="mt-2 inline-flex w-full items-center justify-between rounded-lg border border-white/10 bg-[#111316] px-2.5 py-2 text-[11px] font-semibold text-[#BFC2C7] transition hover:bg-[#171a1f]"
              >
                <span className={`uppercase tracking-wider ${included ? "text-[#d7b5b5]" : "text-[#7b7f87]"}`}>
                  {included ? "Active" : "Off"}
                </span>
                <span className={switchTrackClass(included)}>
                  <span className={switchThumbClass(included)} />
                </span>
              </button>
            </article>
          );
        })}

        <article
          className={`rounded-xl border p-3 transition ${
            inputs.sizeHint
              ? "border-[#8b4f4f]/35 bg-[linear-gradient(180deg,#171011_0%,#0F1012_100%)]"
              : "border-white/10 bg-[#0F1012]"
          }`}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-sm text-white">Size Hint</p>
            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${tone(sizeStatus)}`}>{sizeStatus}</span>
          </div>
          <p className="text-xs text-[#BFC2C7]">
            Size Hint: <span className="font-semibold text-[#F5C542]">{data.sizeHint}</span>
          </p>
          <p className="text-xs text-[#6B6F76]">{data.sizeHintReason}</p>
          <p className="mt-1 text-xs text-[#6B6F76]">
            Session: {data.sessionContext.session} | Liquidity expectation: {data.sessionContext.liquidityExpectation}
          </p>
        </article>
      </div>
    </section>
  );
};
