import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Garante scroll no topo ao trocar de rota; respeita âncoras (#secao) quando presentes. */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const id = hash.replace('#', '');
      const scrollToHash = () => {
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
          return true;
        }
        return false;
      };

      if (!scrollToHash()) {
        window.setTimeout(scrollToHash, 100);
      }
      return;
    }

    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}

export default ScrollToTop;
