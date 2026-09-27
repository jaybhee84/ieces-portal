import React from 'react';
import { createRoot } from 'react-dom/client';
import { PrintPreviewProvider, usePrintPreview } from '../src/component/PrintPreview/PrintPreviewContext';
import '../src/index.css';
import NutritionPrintTable from '../src/component/NutritionPrintTable';
import '../src/styles/NutritionalStatus.css';

function Fixture() {
  const { requestPrint } = usePrintPreview();
  const html = `<!doctype html><html><head><style>
    @page { size: 8.5in 13in; margin: .3in; }
    body { margin: 0; font-family: Arial; }
    section { break-after: page; } section:last-child { break-after: auto; }
    h1 { color: #7b1a1a; } .card { border: 2px solid #123; background: #dbeafe; width: 220px; height: 300px; padding: 20px; }
  </style></head><body><section><h1>Student IDs - fronts</h1><div class="card">Sample Learner<br>Test document</div></section>
    <section><h1>Student IDs - backs</h1><div class="card">Emergency contact<br>Test document</div></section></body></html>`;
  return <>
    <button id="open-preview" onClick={() => requestPrint({ html, paper: 'Folio', margin: 0.3 })}>Preview sample IDs</button>
    <button id="open-stepped" onClick={() => requestPrint({ html, paper: 'Folio', margin: 0.3, pagePrompt: page => `Flip the sheet for page ${page}.` })}>Preview stepped IDs</button>
    <button id="open-report" onClick={() => requestPrint()}>Preview sample report</button>
    <div className="nsr-report" data-print-paper="Legal" data-print-margin="0.35"><h1>Sample Legal report</h1>
      <NutritionPrintTable weighingDate="2026-06-09" gradeClass="Grade 4: SAMPLE" rows={Array.from({ length: 25 }, (_, i) => ({
        student: { id: i, last_name: ['SAMPLE', 'EXAMPLE', 'TEST'][i % 3], first_name: i === 4 ? 'MARIA ALEXANDRA CHRISTINE JOSEPHINE' : 'ALEXANDRA MARIE', birthdate: '2017-03-08' },
        report: { sex: i % 2 ? 'F' : 'M', ageYearMonth: '9.11', weightKg: 25, heightMeters: 1.494, heightSquaredMeters: 2.232036, bmi: 15.6, bmiStatus: 'Severely Wasted', hfaStatus: 'Severely Stunted' },
      }))} />
    </div>
    <style>{'@media print { button { display: none; } @page { size: legal; margin: 0; } }'}</style>
  </>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><PrintPreviewProvider><Fixture /></PrintPreviewProvider></React.StrictMode>);
