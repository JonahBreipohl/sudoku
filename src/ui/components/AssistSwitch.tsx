import { ASSISTS, type Assist } from "../../state/settings";
import { assist as t } from "../strings";
import { Icon } from "../icons";

/**
 * Three-position assistance switch. Native radios give arrow-key movement and one tab stop; the
 * chosen position gets a raised thumb, bold text and a dot, so it never reads by color alone.
 */
export function AssistSwitch({ value, onChange }: { value: Assist; onChange: (a: Assist) => void }) {
  return (
    <fieldset className="assist" role="radiogroup">
      <legend className="assist-legend">{t.legend}</legend>
      <div className="assist-track">
        {ASSISTS.map((a) => (
          <label key={a} className={a === value ? "assist-option assist-option--on" : "assist-option"}>
            <input
              type="radio"
              name="assist"
              value={a}
              checked={a === value}
              onChange={() => onChange(a)}
            />
            <span aria-hidden="true" className="assist-dot">
              {a === value && <Icon name="dot" />}
            </span>
            {t.levels[a]}
          </label>
        ))}
      </div>
      <p className="assist-help">{t.help[value]}</p>
    </fieldset>
  );
}
