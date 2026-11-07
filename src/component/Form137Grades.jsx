import React, { useState } from "react";
import { gradeRemark } from "../lib/form137Remarks.mjs";
import { CURRICULUM_GROUPS } from "../lib/elementaryLearningAreas.mjs";

const fixedLearningAreas = new Set(CURRICULUM_GROUPS.slice(1).flatMap((group) => group.areas));

export function Form137Grades({ subjects, onChange }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const subject = subjects[selectedIndex];

  return (
    <div className="f137-grades-workspace">
      <div className="f137-learning-areas" aria-label="Learning areas">
        {subjects.map((item, index) => (
          <button key={index} type="button" aria-pressed={selectedIndex === index} onClick={() => setSelectedIndex(index)}>
            <span>{index + 1}</span>{item.name || `Additional learning area ${index + 1}`}
          </button>
        ))}
      </div>
      {subject ? <fieldset className="f137-subject-editor">
        <legend>{subject.name || "Additional learning area"}</legend>
        {!fixedLearningAreas.has(subject.name) && <label className="f137-field">
          <span>Learning area</span>
          <input readOnly={!navigator.onLine} list="f137-subject-options" value={subject.name} onChange={(event) => onChange(selectedIndex, "name", event.target.value)} />
        </label>}
        <div className="f137-quarter-fields">
          {["q1", "q2", "q3", "q4", "final"].map((field, index) => (
            <label key={field} className="f137-field">
              <span>{field === "final" ? "Final rating" : `Quarter ${index + 1}`}</span>
              <input readOnly={!navigator.onLine} inputMode="decimal" value={subject[field]} onChange={(event) => onChange(selectedIndex, field, event.target.value.replace(/[^0-9.]/g, "").slice(0, 5))} />
            </label>
          ))}
        </div>
        <label className="f137-field">
          <span>Remarks</span>
          <input value={gradeRemark(subject.final)} readOnly placeholder="Generated from final rating" />
        </label>
        <p>Remarks are generated from the final rating: 75–100 Passed; 60–74 Failed. Blank or invalid ratings have no remark.</p>
        <p>Grades update the output immediately. Use Save Information to save the learner’s record.</p>
      </fieldset> : <p>No learning areas are available in this record.</p>}
    </div>
  );
}
