(async () => {
  const MAX_PAGES = 31;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  let banner = document.getElementById('wm-status-banner');
  if (banner) banner.remove();

  banner = document.createElement('div');
  banner.id = 'wm-status-banner';
  banner.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:999999;background:#18181b;color:#fff;padding:10px 20px;border-radius:12px;border:2px solid #3b82f6;font-family:sans-serif;font-size:13px;font-weight:bold;box-shadow:0 10px 30px rgba(0,0,0,0.7);pointer-events:none;text-align:center;';
  banner.innerText = 'Demarrage du scan ultra-rapide...';
  document.body.appendChild(banner);

  const setStatus = (msg) => { banner.innerText = msg; };

  // Attente agressive (verifie toutes les 20ms au lieu de 100ms)
  async function waitGone(selector, timeout = 2000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (!document.querySelector(selector)) return true;
      await sleep(20);
    }
    return false;
  }

  function getPageText() {
    const el = Array.from(document.querySelectorAll('span')).find(s => s.innerText.includes('Page '));
    return el ? el.innerText.trim() : '';
  }

  const collectedData = [];
  let totalMarketValue = 0;
  let pageIndex = 0;

  try {
    while (pageIndex < MAX_PAGES) {
      pageIndex++;
      const currentIndicator = getPageText() || ('Page ' + pageIndex);
      setStatus('Scan rapide : ' + currentIndicator + '...');

      const cards = Array.from(document.querySelectorAll('.relative.isolate.group'));

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const titleEl = card.querySelector('h3');
        const cardName = titleEl ? titleEl.innerText.trim() : 'Inconnue';

        const rarityEl = card.querySelector('.rounded-md.text-xs.font-bold');
        const rarity = rarityEl ? rarityEl.innerText.trim() : 'NC';

        setStatus('[' + currentIndicator + '] (' + (i + 1) + '/' + cards.length + ') ' + cardName);

        // 1. Clic sur la carte
        const trigger = card.querySelector('.rounded-2xl') || card;
        trigger.click();

        // 2. Attente express du bouton "Mettre aux encheres"
        let auctionBtn = null;
        const tBtn = Date.now();
        while (Date.now() - tBtn < 2000) {
          auctionBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Mettre aux ench'));
          if (auctionBtn) break;
          await sleep(20);
        }

        if (!auctionBtn) {
          const closeMain = document.querySelector('button[aria-label="Fermer"]');
          if (closeMain) closeMain.click();
          await waitGone('.fixed.inset-0.z-50', 1000);
          continue;
        }

        // 3. Clic et lecture immediate du prix
        auctionBtn.click();
        
        let price = null;
        let status = 'Aucune vente';
        const tPrice = Date.now();

        while (Date.now() - tPrice < 2000) {
          const modals = Array.from(document.querySelectorAll('.fixed.inset-0'));
          const topModal = modals[modals.length - 1];

          if (topModal) {
            if (topModal.innerText.includes('Aucune vente')) {
              status = 'Aucune vente';
              price = null;
              break;
            }

            const avgLabels = Array.from(topModal.querySelectorAll('span')).filter(s => s.innerText.trim() === 'Moyenne');
            if (avgLabels.length > 0) {
              const row = avgLabels[avgLabels.length - 1].parentElement;
              const priceEl = row ? row.querySelector('.tabular-nums') : null;
              if (priceEl && priceEl.innerText.trim() !== '') {
                price = parseInt(priceEl.innerText.replace(/[^0-9]/g, ''), 10) || 0;
                status = price + ' WB';
                break;
              }
            }
          }
          await sleep(20);
        }

        collectedData.push({
          carte: cardName,
          rarete: rarity,
          prix: price,
          statut: status,
          page: currentIndicator
        });

        if (price) totalMarketValue += price;

        // 4. Fermeture instantanee en cascade
        const allCloseBtns = Array.from(document.querySelectorAll('button[aria-label="Fermer"]'));
        if (allCloseBtns.length > 1) {
          allCloseBtns[allCloseBtns.length - 1].click();
          await sleep(30); // Micro-pause pour React
        }

        const mainClose = document.querySelector('button[aria-label="Fermer"]');
        if (mainClose) {
          mainClose.click();
          await waitGone('.fixed.inset-0.z-50', 1000);
        }
      }

      // 5. Page suivante
      const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Suivant'));
      if (!nextBtn || nextBtn.disabled) break;

      nextBtn.click();

      const tPage = Date.now();
      while (Date.now() - tPage < 3000) {
        await sleep(50);
        if (getPageText() !== currentIndicator) break;
      }
      await sleep(150); // Legere marge pour que les images chargent
    }
  } finally {
    banner.remove();
  }

  collectedData.sort((a, b) => (b.prix || 0) - (a.prix || 0));

  let txt = '========================================================\n';
  txt += '       WIKIMASTERS - ESTIMATION DES COTES DE CARTES     \n';
  txt += '========================================================\n\n';
  txt += 'Total cartes analysees : ' + collectedData.length + '\n';
  txt += 'Valeur totale estimee : ' + totalMarketValue.toLocaleString('fr-FR') + ' WikiBidous\n\n';
  txt += '--------------------------------------------------------\n';
  txt += 'DETAIL DES CARTES (DU PLUS CHER AU MOINS CHER)\n';
  txt += '--------------------------------------------------------\n\n';

  collectedData.forEach((item, idx) => {
    const pos = (idx + 1).toString().padStart(3, ' ');
    const p = item.prix !== null ? (item.prix + ' WB') : 'Aucune vente';
    txt += pos + '. [' + item.rarete + '] ' + item.carte + '\n';
    txt += '     Prix moyen : ' + p + ' | ' + item.page + '\n\n';
  });

  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mes_cotes_rapide.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('Fichier exporte en vitesse Turbo !');
})();
