const http = require('http');

const rowTeam = 'Metz';
const colTeam = 'Galatasaray';

http.get('http://localhost:3000/players', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const players = JSON.parse(data);
            console.log(`Fetched ${players.length} players.`);

            const ribery = players.find(p => p.name.includes('Rib'));
            console.log('Ribery data:', JSON.stringify(ribery, null, 2));

            if (!ribery) {
                console.error('Ribery NOT found!');
                return;
            }

            const hasRow = ribery.teams.includes(rowTeam);
            const hasCol = ribery.teams.includes(colTeam);

            console.log(`Has ${rowTeam}? ${hasRow}`);
            console.log(`Has ${colTeam}? ${hasCol}`);

            const valid = players.filter(p => p.teams.includes(rowTeam) && p.teams.includes(colTeam));
            console.log('Valid players for intersection:', valid.map(p => p.name));

            if (valid.length === 0) {
                console.error('FAILURE: Logic found no common players!');
            } else {
                console.log('SUCCESS: Logic found players.');
            }

        } catch (e) {
            console.error('Error parsing JSON:', e);
            console.log('Raw data:', data);
        }
    });
}).on('error', err => {
    console.error('Request error:', err);
});
