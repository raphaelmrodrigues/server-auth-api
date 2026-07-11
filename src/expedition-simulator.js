/**
 * Expedition "all enemies" simulator via DinoDevs public site.
 * One Calculate request returns win% tables for Italy/Africa/Germania/Britannia.
 *
 * Not open-sourced by DinoDevs — we proxy their all-enemies HTML into JSON
 * for the GladiusBot UI (manual Calculate only, not a hot loop).
 */

const DINO_BASE = 'https://simulator.dinodevs.com';

/** Location/enemy labels from DinoDevs expeditions.js (public). */
const EXPEDITION_META = {
    italy: {
        label: 'Italy',
        locations: [
            ['Grimwood', 'Rat', 'Lynx', 'Wolf', 'Bear'],
            ['Pirate Harbour', 'Fled Slave', 'Corrupt Soldier', 'Assassin', 'Captain'],
            ['Misty Mountains', 'Elusive Recruit', 'Harpy', 'Cerberus', 'Medusa'],
            ['Wolf Cave', 'Wild Boar', 'Wolf Pack', 'Alphawolf', 'Werewolf'],
            ['Ancient Temple', 'Cultist Guard', 'Wererat', 'Minotaur', 'Minotaur Chief'],
            ['Barbarian Village', 'Barbarian', 'Barbarian Warrior', 'Berserker', 'Barbarian Chief'],
            ['Bandit Camp', 'Renegade Soldier', 'Renegade Mercenary', 'Assassinator', 'Bandit Chief'],
        ],
    },
    africa: {
        label: 'Africa',
        locations: [
            ['Voodoo Temple', 'Cobra', 'Giant Scorpion', 'Awakened Mummy', 'Seth Priest'],
            ['Bridge', 'Tax Collector', 'Man Eater', 'Tribal Warrior', 'Bone Shaman'],
            ['Blood Cave', 'Blood Wolf', 'Giant Beetle', 'Fire Dancer', 'Fire Demon'],
            ['Lost Harbour', 'Crocodile', 'Undead Holder', 'Giant Water Snake', 'Mokele Mbembe'],
            ['Umpokta Tribe', 'Tribal Warrior', 'Tribal Magician', 'Spirit Warrior', 'Seth High Priest'],
            ['Caravan', 'Spy', 'Caravan Guard', 'Elite Guard', 'Slave Merchant'],
            ['Mesoai-Oasis', 'Elephant', 'Cheetah', 'Demon Lion', 'Demon Elephant'],
            ['Cliff Jumper', 'Cursed Antelope', 'Giant Spider', 'Shaman', 'High Shaman'],
        ],
    },
    germania: {
        label: 'Germania',
        locations: [
            ['Cave Temple', 'Legionnaire', 'Myrmidon', 'Centurion', 'Soulless'],
            ['The green forest', 'Giant Wild Boar', 'Swamp Lord', 'Swamp Spirit', 'Werebear'],
            ['Cursed Village', 'Hun', 'Ancient', 'Nachzehrer', 'Abomination'],
            ['Death Hill', 'Skeleton Warrior', 'Skeleton Berserker', 'Lich', 'Necromancer Prince'],
            ['Vandal Village', 'Vandal Warrior', 'Jarl', 'Dark Fighter', 'Death Knight'],
            ['Mine', 'Guard', 'Draug', 'Stone Golem', 'Tatzelwurm'],
            ['Teuton Camp', 'Barbarian', 'Teuton Hero', 'Teuton Lord', 'Seidr'],
            ['Koman Mountain', 'Infernal Springbok', 'Sabre-Tooth Tiger', 'Dragon Whelp', 'Dragon'],
            ['Dragon Remains', 'Bone Golem', 'Lemures', 'Ritualist', 'Dracolich'],
        ],
    },
    britannia: {
        label: 'Britannia',
        locations: [
            ['Bank of Thames', 'Bibroci', 'Ancalite', 'Cenimagni', 'Cassi'],
            ['Forest Fortress', 'Wood Elf', 'Dwarf', 'British Chariot', 'Callirius'],
            ['The Moor', 'The man from Lindow', 'The woman from Lindow', 'Bandit', 'Nodens'],
            ['Camp Cassivellaunus', 'Chariot Rider', 'Mercenary', 'Fluror', 'Cassivellaunus'],
        ],
    },
};

const COUNTRY_KEY_BY_LABEL = Object.fromEntries(
    Object.entries(EXPEDITION_META).map(([key, v]) => [v.label.toLowerCase(), key])
);

function pickCookies(response) {
    const list = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [];
    return list.map((c) => String(c).split(';')[0]).filter(Boolean).join('; ');
}

function parsePercent(text) {
    const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*%/);
    return m ? Math.round(Number(m[1]) * 100) / 100 : 0;
}

function parseAllEnemiesHtml(html) {
    const countries = {};
    const blocks = html.split(/<h2>/i).slice(1);
    for (const block of blocks) {
        const labelMatch = block.match(/^([^<]+)<\/h2>/i);
        if (!labelMatch) continue;
        const label = labelMatch[1].trim();
        const key = COUNTRY_KEY_BY_LABEL[label.toLowerCase()];
        if (!key) continue;

        const meta = EXPEDITION_META[key];
        const tableMatch = block.match(/<table[\s\S]*?<\/table>/i);
        if (!tableMatch) continue;
        const rows = [...tableMatch[0].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
        const locations = [];

        for (const row of rows) {
            const locMatch = row.match(/<small>\s*Location\s*(\d+)\s*<\/small>\s*(?:&nbsp;|\u00a0|\s)+\s*([^<]+)/i);
            if (!locMatch) continue;
            const locIndex = parseInt(locMatch[1], 10) - 1;
            const locName = (locMatch[2] || '').trim() || meta.locations[locIndex]?.[0] || `Location ${locIndex + 1}`;
            const enemyPcts = [...row.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));

            const enemies = [0, 1, 2, 3].map((i) => ({
                slot: i + 1,
                name: meta.locations[locIndex]?.[i + 1] || `Enemy ${i + 1}`,
                winChance: enemyPcts[i] != null ? enemyPcts[i] : 0,
            }));

            locations.push({
                index: locIndex + 1,
                name: locName,
                enemies,
            });
        }

        countries[key] = {
            key,
            label: meta.label,
            locations,
        };
    }
    return countries;
}

/**
 * @param {{ name: string, country: string, server: string|number }} player
 */
async function fetchExpeditionAllEnemies(player) {
    const name = String(player.name || '').trim();
    const country = String(player.country || '').trim().toLowerCase();
    const server = String(player.server || '').trim();
    if (!name || !country || !server) {
        return { error: 'Missing player name, country or server.' };
    }

    const pageRes = await fetch(`${DINO_BASE}/expedition.php`);
    if (!pageRes.ok) {
        return { error: 'Expedition simulator unavailable.' };
    }
    const cookie = pickCookies(pageRes);
    const pageHtml = await pageRes.text();
    const key = (pageHtml.match(/name="key-awesome"\s+value="([a-f0-9]+)"/i) || [])[1];
    if (!key) {
        return { error: 'Could not initialize expedition simulator session.' };
    }

    const body = new URLSearchParams({
        'key-awesome': key,
        'attacker-name': name,
        'attacker-country': country,
        'attacker-server': server,
        'enemy-country': 'italy',
        'enemy-location': '1',
        'enemy-enemy': '1',
        'simulate-all': '',
    });

    const postRes = await fetch(`${DINO_BASE}/expedition.php`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Origin: DINO_BASE,
            Referer: `${DINO_BASE}/expedition.php`,
            Cookie: cookie,
        },
        body: body.toString(),
        redirect: 'manual',
    });

    let loc = postRes.headers.get('location');
    if (!loc) {
        return { error: 'Expedition simulation failed (no result redirect).' };
    }
    if (!loc.startsWith('http')) {
        loc = `${DINO_BASE}/${loc.replace(/^\//, '')}`;
    }

    const resultRes = await fetch(loc, {
        headers: {
            Cookie: cookie,
            Referer: `${DINO_BASE}/expedition.php`,
        },
    });
    if (!resultRes.ok) {
        return { error: 'Expedition simulation result unavailable.' };
    }
    const resultHtml = await resultRes.text();
    const countries = parseAllEnemiesHtml(resultHtml);
    if (!Object.keys(countries).length) {
        return { error: 'Could not parse expedition simulation tables.' };
    }

    return {
        player: {
            name,
            country,
            server: String(server),
            label: `${name} @ s${server}-${country}`,
        },
        countries,
        calculatedAt: new Date().toISOString(),
        source: 'dinodevs-all-enemies',
    };
}

function listExpeditionCountries() {
    return Object.entries(EXPEDITION_META).map(([key, v]) => ({
        key,
        label: v.label,
    }));
}

module.exports = {
    fetchExpeditionAllEnemies,
    listExpeditionCountries,
    EXPEDITION_META,
    parseAllEnemiesHtml,
};
