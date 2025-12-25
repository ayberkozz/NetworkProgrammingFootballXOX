const fs = require('fs');
const path = require('path');

const playersData = JSON.parse(fs.readFileSync('players.json', 'utf8'));

// 1. Build Adjacency
const teams = new Set();
playersData.forEach(p => {
    p.teams.forEach(t => teams.add(t));
});
const teamList = Array.from(teams);

const adj = Array(teamList.length).fill(null).map(() => new Set());

for (let i = 0; i < teamList.length; i++) {
    for (let j = i + 1; j < teamList.length; j++) {
        const t1 = teamList[i];
        const t2 = teamList[j];
        const hasCommon = playersData.some(p => p.teams.includes(t1) && p.teams.includes(t2));
        if (hasCommon) {
            adj[i].add(j);
            adj[j].add(i);
        }
    }
}

// 2. Find valid 3x3 grids that support 9 distinct players
const validRowSets = [];

for (let i = 0; i < teamList.length; i++) {
    for (let j = i + 1; j < teamList.length; j++) {
        // commonIJ
        const commonIJ = [];
        adj[i].forEach(n => {
            if (adj[j].has(n)) commonIJ.push(n);
        });

        if (commonIJ.length < 3) continue;

        for (let k = j + 1; k < teamList.length; k++) {
            // commonIJK
            const commonIJK = commonIJ.filter(n => adj[k].has(n));
            const validCols = commonIJK.filter(c => c !== i && c !== j && c !== k);

            if (validCols.length >= 3) {

                // Helper to check 3x3 distinctness
                const findDistinctSolution = (rIndices, cIndices) => {
                    // Get all candidates for each cell
                    const cellCandidates = [];
                    for (let rI of rIndices) {
                        for (let cI of cIndices) {
                            const rowT = teamList[rI];
                            const colT = teamList[cI];
                            const cands = playersData.filter(p => p.teams.includes(rowT) && p.teams.includes(colT)).map(p => p.name);
                            // Optimization: sort candidates by frequency?
                            // Optimization: heuristic, if any cell has 0 cands, fail fast.
                            if (cands.length === 0) return false;
                            cellCandidates.push(cands);
                        }
                    }

                    // Backtracking to pick 9 distinct
                    const used = new Set();
                    const solve = (idx) => {
                        if (idx === 9) return true;

                        // optimization: sort options by degree? No, just try.
                        const options = cellCandidates[idx];
                        for (const opt of options) {
                            if (!used.has(opt)) {
                                used.add(opt);
                                if (solve(idx + 1)) return true;
                                used.delete(opt);
                            }
                        }
                        return false;
                    };

                    return solve(0);
                };

                // Try combinations of 3 cols from validCols
                const colsToCheck = validCols.slice(0, 20); // Limit search space
                let bestCols = null;

                const n = colsToCheck.length;
                for (let x = 0; x < n - 2; x++) {
                    if (bestCols) break;
                    for (let y = x + 1; y < n - 1; y++) {
                        if (bestCols) break;
                        for (let z = y + 1; z < n; z++) {
                            if (findDistinctSolution([i, j, k], [colsToCheck[x], colsToCheck[y], colsToCheck[z]])) {
                                bestCols = [colsToCheck[x], colsToCheck[y], colsToCheck[z]];
                                break;
                            }
                        }
                    }
                }

                if (bestCols) {
                    validRowSets.push({
                        rows: [teamList[i], teamList[j], teamList[k]],
                        potentialCols: bestCols.map(c => teamList[c])
                    });
                }
            }
        }
    }
}

console.log(`Found ${validRowSets.length} valid, fully fillable 3x3 configurations.`);

// Shuffle and save
for (let i = validRowSets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [validRowSets[i], validRowSets[j]] = [validRowSets[j], validRowSets[i]];
}

fs.writeFileSync('data/valid_games.json', JSON.stringify(validRowSets, null, 2));
console.log('Saved to data/valid_games.json');
