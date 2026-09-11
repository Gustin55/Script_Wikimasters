(async () => {
  const MAX_PAGES = 31;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 1. Bandeau visuel
  let banner = document.getElementById('wm-god-banner');
  if (banner) banner.remove();
  banner = document.createElement('div');
  banner.id = 'wm-god-banner';
  banner.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:999999;background:#18181b;color:#00ff88;padding:12px 24px;border-radius:12px;border:2px solid #00ff88;font-family:sans-serif;font-size:14px;font-weight:bold;box-shadow:0 10px 30px rgba(0,0,0,0.8);pointer-events:none;text-align:center;';
  document.body.appendChild(banner);
  const setStatus = msg => { banner.innerText = msg; };

  // 2. INTERCEPTEUR RÉSEAU : Écoute les requêtes du site pour savoir quand il a fini de charger
  if (!window.__wm_fetch_hooked) {
    window.__wm_active_fetches = 0;
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
      window.__wm_active_fetches++;
      try {
        return await origFetch.apply(this, args);
      } finally {
        window.__wm_active_fetches--;
      }
    };
    window.__wm_fetch_hooked = true;
  }

  // Ignorer l'ID Utilisateur lors de la recherche
  const html = document.documentElement.innerHTML;
  const userIdMatch = html.match(/"userId"\s*:\s*"([a-f0-9\-]{36})"/i);
  const userId = userIdMatch ? userIdMatch[1] : null;

  function getPageText() {
    const el = Array.from(document.querySelectorAll('span')).find(s => s.innerText && s.innerText.includes('Page '));
    return el ? el.innerText.trim() : '';
  }

  const allCards = [];
  let pageIndex = 0;

  setStatus('🚀 Lancement de l\'Aspirateur Synchronisé...');

  try {
    // --- PHASE 1 : ASPIRATION DES ID SUR LES 31 PAGES ---
    while (pageIndex < MAX_PAGES) {
      pageIndex++;
      const curPage = getPageText() || ('Page ' + pageIndex);
      setStatus('⚡ Extraction invisible : ' + curPage + '...');

      const cards = Array.from(document.querySelectorAll('.relative.isolate.group'));
      if (cards.length === 0) break;

      for (const card of cards) {
        const nameEl = card.querySelector('h3');
        const cardName = nameEl ? nameEl.innerText.trim() : 'Inconnue';
        const rarityEl = card.querySelector('.rounded-md.text-xs.font-bold');
        const rarity = rarityEl ? rarityEl.innerText.trim() : 'NC';

        let foundId = null;
        const cache = new Set();
        
        // Fouille de la memoire React
        function searchFiber(obj, depth) {
          if (foundId || depth > 8 || !obj || typeof obj !== 'object' || cache.has(obj)) return;
          cache.add(obj);
          
          for (const key in obj) {
            if (key === 'children' || key === 'return' || key === 'alternate' || key === '_owner') continue;
            try {
              const val = obj[key];
              if (typeof val === 'string' && val.length === 36) {
                if (val !== userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
                  foundId = val;
                  return;
                }
              } else if (typeof val === 'object') {
                searchFiber(val, depth + 1);
              }
            } catch(e) {}
          }
        }

        const elements = [card, ...Array.from(card.querySelectorAll('*'))];
        for (const el of elements) {
          if (foundId) break;
          for (const key in el) {
            if (key.startsWith('__reactFiber')) {
               let node = el[key];
               for(let i=0; i<4; i++) {
                 if (node && node.memoizedProps) searchFiber(node.memoizedProps, 0);
                 if (node) node = node.return;
               }
            }
          }
        }

        allCards.push({
           carte: cardName,
           rarete: rarity,
           id: foundId,
           page: curPage,
           prix: null,
           statut: foundId ? 'En attente...' : 'ID Introuvable'
        });
      }

      // Clic Suivant
      const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Suivant'));
      if (!nextBtn || nextBtn.disabled) break;

      nextBtn.click();
      setStatus(`⏳ Attente du serveur pour la page ${pageIndex + 1}...`);

      // 3. ATTENTE INTELLIGENTE DU RÉSEAU !
      await sleep(100); // Laisse le clic déclencher la requête
      
      let netTimeout = 0;
      // On boucle tant que le navigateur discute avec le serveur (max 15 secondes)
      while (window.__wm_active_fetches > 0 && netTimeout < 15000) {
        await sleep(100);
        netTimeout += 100;
      }

      // Sécurité : on s'assure que le texte de la pagination a bien changé
      let textTimeout = 0;
      const expectedPage = 'Page ' + (pageIndex + 1);
      while (textTimeout < 5000) {
        if (getPageText().includes(expectedPage)) break;
        await sleep(100);
        textTimeout += 100;
      }
      
      // On laisse 0.5 seconde à la page pour s'afficher correctement avant de scanner à nouveau
      await sleep(500);
    }

    // --- PHASE 2 : FRAPPE MASSIVE SUR L'API DU MARCHE ---
    const totalToFetch = allCards.filter(c => c.id).length;
    setStatus('🌐 Interrogation de l\'API pour ' + totalToFetch + ' cartes...');
    
    const batchSize = 40; 
    for (let i = 0; i < allCards.length; i += batchSize) {
       const batch = allCards.slice(i, i + batchSize);
       
       await Promise.all(batch.map(async (c) => {
          if (!c.id) return;
          try {
             const res = await fetch('/api/marketplace/cards/' + c.id + '/sales?scope=summary');
             if (res.ok) {
                const data = await res.json();
                let rawPrice = data.averagePrice || data.average || data.avg || (data.summary && data.summary.averagePrice);
                if (!rawPrice) {
                   const str = JSON.stringify(data).toLowerCase();
                   const match = str.match(/"(?:averageprice|average|avg|moyenne)"\s*:\s*([\d.]+)/);
                   if (match) rawPrice = parseFloat(match[1]);
                }
                if (rawPrice && rawPrice > 0) {
                    c.prix = Math.round(rawPrice);
                    c.statut = c.prix + ' WB';
                } else {
                    c.statut = 'Aucune vente';
                }
             } else {
                c.statut = 'Aucune vente';
             }
          } catch(e) {
             c.statut = 'Erreur API';
          }
       }));
       
       setStatus('🌐 Interrogation API : ' + Math.min(i + batchSize, allCards.length) + ' / ' + allCards.length + ' cartes...');
       await sleep(60); 
    }

  } finally {
    if(banner) banner.remove();
  }

  // --- PHASE 3 : TRI ET TELECHARGEMENT ---
  let totalValue = 0;
  allCards.forEach(c => { if(c.prix) totalValue += c.prix; });
  allCards.sort((a, b) => (b.prix || 0) - (a.prix || 0));

  let txt = '========================================================\n';
  txt += '       WIKIMASTERS - ESTIMATION DES COTES DE CARTES     \n';
  txt += '========================================================\n\n';
  txt += 'Total cartes analysees : ' + allCards.length + '\n';
  txt += 'Valeur totale estimee : ' + totalValue.toLocaleString('fr-FR') + ' WikiBidous\n\n';
  txt += '--------------------------------------------------------\n';
  txt += 'DETAIL DES CARTES (DU PLUS CHER AU MOINS CHER)\n';
  txt += '--------------------------------------------------------\n\n';

  allCards.forEach((item, idx) => {
    const pos = (idx + 1).toString().padStart(3, ' ');
    const p = item.prix !== null ? (item.prix + ' WB') : item.statut;
    txt += pos + '. [' + item.rarete + '] ' + item.carte + '\n';
    txt += '     Prix moyen : ' + p + ' | ' + item.page + '\n\n';
  });

  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cotes_ultimes_synchro.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log("%c[WikiMasters] Scan terminé avec succès ! Les données sont parfaites.", "color: #00ff88; font-weight: bold; font-size: 14px;");
})();
