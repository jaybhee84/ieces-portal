import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PrintPreviewModal from "./PrintPreviewModal";

const PrintPreviewContext = createContext(null);

export function PrintPreviewProvider({ children }) {
  const [setup, setSetup] = useState(null);
  const busy = useRef(false);
  const requestPrint = useCallback(async (options = {}) => {
    if (busy.current) return;
    const root = document.querySelector('[data-print-paper]');
    const paper = options.paper || root?.dataset.printPaper || 'Legal';
    const margin = options.margin ?? Number(root?.dataset.printMargin || 0);
    if (!window.electronAPI?.printPrepare) {
      if (!options.html) { window.print(); return; }
      const popup = window.open('', '_blank', 'width=900,height=1000');
      if (!popup) throw new Error('Allow popups to preview learner IDs.');
      popup.document.write(options.html);
      popup.document.close();
      await popup.document.fonts.ready;
      await Promise.all([...popup.document.images].map(img => img.decode().catch(() => {})));
      popup.focus();
      popup.print();
      return;
    }
    busy.current = true;
    try {
      const result = await window.electronAPI.printPrepare({ html: options.html, paper, margin });
      if (!result?.success) throw new Error(result?.error || 'Could not prepare the document.');
      // pagePrompt(nextPage, totalPages) switches to page-by-page printing: the user
      // confirms before each later page (e.g. to flip a sheet for manual duplex).
      setSetup({ paper, orientation: 'portrait', margins: 'match', customMargins: { top: margin, bottom: margin, left: margin, right: margin }, pagePrompt: options.pagePrompt });
    } catch (error) {
      busy.current = false;
      const message = error.message || 'Could not prepare the print preview.';
      window.alert(message.includes("No handler registered for 'print:prepare'")
        ? 'Please save your work, close all portal windows, and reopen the Electron app to enable Print Preview. Reloading the page does not update the print service.'
        : message);
    }
  }, []);

  const closePreview = useCallback(() => {
    setSetup(null);
    window.electronAPI?.printCleanupPreview?.().finally(() => { busy.current = false; });
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'p') return;
      if (!window.electronAPI?.printPrepare) return;
      event.preventDefault();
      if (busy.current) return;
      const idButton = document.querySelector('[data-print-ids]');
      if (idButton) { idButton.click(); return; }
      if (document.querySelector('[data-print-paper]')) requestPrint();
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [requestPrint]);

  return <PrintPreviewContext.Provider value={{ requestPrint }}>
    {children}
    {setup && createPortal(<PrintPreviewModal setup={setup} onClose={closePreview} />, document.body)}
  </PrintPreviewContext.Provider>;
}

export function usePrintPreview() {
  return useContext(PrintPreviewContext);
}
