(async () => {
  console.log("%c[WikiMasters] Début du scan automatique de la collection...", "color: #ff5722; font-weight: bold;");

  const cardsMap = new Map(); // Nom -> { count, pages: Set }
  let currentPage = 1;

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function extractCardsOnPage(pageNum) {
    const cardNodes = document.querySelectorAll('.relative.isolate.group');
    cardNodes.forEach(card => {
      const titleEl = card.querySelector('h3');
      if (titleEl) {
        const name = titleEl.innerText.trim();
        if (name) {
          if (!cardsMap.has(name)) {
            cardsMap.set(name, { count: 0, pages: new Set() });
          }
          const item = cardsMap.get(name);
          item.count += 1;
          item.pages.add(pageNum);
        }
      }
    });
  }

  while (true) {
    // 1. Lire la pagination actuelle
    const pageIndicator = Array.from(document.querySelectorAll('span')).find(el => el.innerText.includes('Page '));
    const pageText = pageIndicator ? pageIndicator.innerText.trim() : `Page ${currentPage}`;
    console.log(`Lecture de la ${pageText}...`);

    // 2. Extraire les cartes visibles
    extractCardsOnPage(currentPage);

    // 3. Chercher le bouton "Suivant →"
    const nextButtons = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('Suivant'));
    const nextBtn = nextButtons[0];

    // Vérifier si le bouton existe et n'est pas désactivé
    if (nextBtn && !nextBtn.disabled) {
      currentPage++;
      nextBtn.click();
      // Pause de 600ms pour laisser le temps à Next.js de rafraîchir le DOM
      await wait(600);
    } else {
      break;
    }
  }

  // 4. Bilan complet
  console.log("%c[WikiMasters] Scan terminé avec succès !", "color: #4caf50; font-weight: bold; font-size: 14px;");

  const duplicates = Array.from(cardsMap.entries())
    .filter(([_, data]) => data.count > 1)
    .map(([name, data]) => ({
      'Nom de la carte': name,
      'Quantité totale': data.count,
      'Pages où elle se trouve': Array.from(data.pages).join(', ')
    }))
    .sort((a, b) => b['Quantité totale'] - a['Quantité totale']);

  if (duplicates.length > 0) {
    console.log(`%cTotal : ${duplicates.length} doublons trouvés sur l'ensemble de ta collection !`, "color: #ff5722; font-weight: bold;");
    console.table(duplicates);
    
    // Garde les données accessibles dans une variable si besoin
    window.mesDoublons = duplicates;
    console.log("Les doublons sont aussi sauvegardés dans la variable : mesDoublons");
  } else {
    console.log("Aucun doublon trouvé sur l'ensemble des pages.");
  }
})();
