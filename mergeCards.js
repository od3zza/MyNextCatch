const fs = require('fs');
const path = require('path');

const cardsDir = path.join(__dirname, 'cards/en'); // pasta com todos os JSON de conjuntos
const outputFile = path.join(__dirname, 'data/cards.json');

let allCards = [];

fs.readdirSync(cardsDir).forEach(file => {
  if (file.endsWith('.json')) {
    const filePath = path.join(cardsDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    allCards.push(...data); // adiciona todas as cartas
  }
});

fs.writeFileSync(outputFile, JSON.stringify(allCards, null, 2), 'utf-8');
console.log(`Merged ${allCards.length} cards into ${outputFile}`);
