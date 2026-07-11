/**
 * Arena battle simulator — ported from DinoDevs/GladiatusBattleSimulator
 * (simulate_arena.php, GPL/open-source).
 *
 * Accepts the GladiusBot payload shape (attacker/defender from contentScript)
 * and returns { winChance, loseChance, drawChance } for the existing bot client.
 *
 * Source: https://github.com/DinoDevs/GladiatusBattleSimulator
 */

const HIT_NORMAL = 1;
const HIT_CRITICAL = 2;
const HIT_AVOIDED_CRITICAL = 3;
const HIT_BLOCKED = 4;
const HIT_MISSED = 5;

const DEFAULT_SIMULATES = Math.min(
    Math.max(parseInt(process.env.ARENA_SIM_COUNT || '1000', 10) || 1000, 1),
    10000
);

function randInt(min, max) {
    const a = Math.floor(Number(min));
    const b = Math.floor(Number(max));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    if (b <= a) return a;
    return a + Math.floor(Math.random() * (b - a + 1));
}

function chanceRoll(percent) {
    return Math.random() * 100 <= Number(percent || 0);
}

function toNum(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function toLifePair(life) {
    if (Array.isArray(life) && life.length >= 2) {
        return [Math.max(1, toNum(life[0], 1)), Math.max(1, toNum(life[1], 1))];
    }
    if (typeof life === 'string' && life.includes('/')) {
        const parts = life.split('/').map((p) => toNum(p.trim(), 0));
        return [Math.max(1, parts[0] || 1), Math.max(1, parts[1] || parts[0] || 1)];
    }
    const v = Math.max(1, toNum(life, 1));
    return [v, v];
}

function toDamagePair(damage) {
    if (Array.isArray(damage) && damage.length >= 2) {
        const min = Math.max(1, toNum(damage[0], 1));
        const max = Math.max(min, toNum(damage[1], min));
        return [min, max];
    }
    const v = Math.max(1, toNum(damage, 1));
    return [v, v];
}

function normalizeBuffs(buffs) {
    const src = buffs && typeof buffs === 'object' ? buffs : {};
    return {
        minerva: !!src.minerva,
        mars: !!src.mars,
        apollo: !!src.apollo,
        honour_veteran: !!(src.honour_veteran || src.honourVeteran),
        honour_destroyer: !!(src.honour_destroyer || src.honourDestroyer),
    };
}

/**
 * Map bot / DinoDevs / mixed stat objects into the internal simulator shape.
 */
function normalizePlayerStats(raw) {
    if (!raw || typeof raw !== 'object') {
        return { error: true, message: 'Missing player stats.' };
    }

    // Already marked as custom DinoDevs-style payload
    const player = raw.custom && typeof raw.custom === 'object' ? { ...raw, ...raw.custom } : raw;

    const level = toNum(player.level, 0);
    const life = toLifePair(player.life);
    const skill = toNum(player.skill != null ? player.skill : player.dexterity, 0);
    const agility = toNum(player.agility, 0);
    const charisma = toNum(player.charisma, 0);
    const intelligence = toNum(player.intelligence, 0);
    const armor = Math.max(0, toNum(player.armor != null ? player.armor : player.armour, 0));
    const damage = toDamagePair(player.damage);
    const avoidCriticalPoints = toNum(
        player['avoid-critical-points'] != null
            ? player['avoid-critical-points']
            : player.avoidCriticalPoints,
        0
    );
    const blockPoints = toNum(
        player['block-points'] != null ? player['block-points'] : player.blockPoints,
        0
    );
    const criticalPoints = toNum(
        player['critical-points'] != null ? player['critical-points'] : player.criticalPoints,
        0
    );

    if (
        level < 1 ||
        life[0] < 1 ||
        life[1] < 1 ||
        skill < 1 ||
        agility < 1 ||
        charisma < 1 ||
        intelligence < 1 ||
        armor < 0 ||
        damage[0] < 1 ||
        damage[1] < 1
    ) {
        return { error: true, message: 'Player stats error.' };
    }

    return {
        level,
        life,
        skill,
        agility,
        charisma,
        intelligence,
        armor,
        damage,
        'avoid-critical-points': Math.max(0, avoidCriticalPoints),
        'block-points': Math.max(0, blockPoints),
        'critical-points': Math.max(0, criticalPoints),
        buffs: normalizeBuffs(player.buffs),
    };
}

function calculateChances(playerAInput, playerBInput) {
    const playerA = { ...playerAInput, buffs: { ...playerAInput.buffs } };
    const playerB = playerBInput;

    let levelFactorA = playerA.level - 8;
    if (levelFactorA < 2) levelFactorA = 2;

    playerA['avoid-critical-chance'] = Math.round(
        (playerA['avoid-critical-points'] * 52) / levelFactorA / 4
    );
    if (playerA['avoid-critical-chance'] > 25) playerA['avoid-critical-chance'] = 25;

    playerA['block-chance'] =
        Math.round((playerA['block-points'] * 52) / levelFactorA / 6) +
        Math.max(0, playerA.level - playerB.level) * 2;
    if (playerA['block-chance'] > 50) playerA['block-chance'] = 50;

    playerA['critical-chance'] = Math.round(
        (playerA['critical-points'] * 52) / levelFactorA / 5
    );
    if (playerA['critical-chance'] > 50) playerA['critical-chance'] = 50;

    playerA['hit-chance'] = Math.floor(
        (playerA.skill / (playerA.skill + playerB.agility)) * 100
    );

    playerA['double-hit-chance'] = Math.round(
        (playerA.charisma * playerA.skill) / (playerB.agility * playerB.intelligence) * 10
    );

    if (playerA.buffs.minerva || playerB.buffs.minerva) playerA['double-hit-chance'] = 0;
    if (playerA.buffs.mars || playerB.buffs.mars) playerA['critical-chance'] = 0;
    if (playerA.buffs.apollo) playerA['block-chance'] += 15;
    if (playerA.buffs.honour_veteran) playerA['critical-chance'] += 10;
    if (playerB.buffs.honour_destroyer) {
        playerA.armor -= playerB.level * 15;
        if (playerA.armor < 0) playerA.armor = 0;
    }

    playerA['armor-absorve'] = [
        Math.floor(playerA.armor / 66) - Math.floor((playerA.armor - 66) / 660 + 1),
        Math.floor(playerA.armor / 66) + Math.floor(playerA.armor / 660),
    ];

    return playerA;
}

function hitSimulation(playerA, playerB) {
    let hitType = HIT_MISSED;
    let hitValue = 0;

    if (chanceRoll(playerA['hit-chance'])) {
        if (chanceRoll(playerA['critical-chance'])) {
            if (chanceRoll(playerB['avoid-critical-chance'])) {
                hitType = HIT_AVOIDED_CRITICAL;
                hitValue =
                    randInt(playerA.damage[0], playerA.damage[1]) -
                    randInt(playerB['armor-absorve'][0], playerB['armor-absorve'][1]);
            } else {
                hitType = HIT_CRITICAL;
                hitValue =
                    2 * randInt(playerA.damage[0], playerA.damage[1]) -
                    randInt(playerB['armor-absorve'][0], playerB['armor-absorve'][1]);
            }
        } else if (chanceRoll(playerB['block-chance'])) {
            hitType = HIT_BLOCKED;
            hitValue =
                randInt(playerA.damage[0], playerA.damage[1]) / 2 -
                randInt(playerB['armor-absorve'][0], playerB['armor-absorve'][1]);
        } else {
            hitType = HIT_NORMAL;
            hitValue =
                randInt(playerA.damage[0], playerA.damage[1]) -
                randInt(playerB['armor-absorve'][0], playerB['armor-absorve'][1]);
        }
    }

    if (hitValue < 0) hitValue = 0;
    return [hitType, hitValue];
}

/**
 * @returns {1|0|-1} win / draw / lose for attacker
 */
function simulateBattle(attackerStats, defenderStats, lifeMode = 'current', battleRounds = 15) {
    let attackerLife = attackerStats.life[0];
    let defenderLife = defenderStats.life[0];
    if (lifeMode === 'full') {
        attackerLife = attackerStats.life[1];
        defenderLife = defenderStats.life[1];
    } else if (lifeMode === 'unlimited' || lifeMode === 'ignore') {
        attackerLife = Number.POSITIVE_INFINITY;
        defenderLife = Number.POSITIVE_INFINITY;
    }

    let scoreAttacker = 0;
    let scoreDefender = 0;
    let rounds = 0;

    while (rounds < battleRounds && attackerLife > 0 && defenderLife > 0) {
        let hit = hitSimulation(attackerStats, defenderStats);
        scoreAttacker += hit[1];
        defenderLife -= hit[1];
        if (defenderLife <= 0) {
            scoreAttacker += defenderLife;
            break;
        }

        if (chanceRoll(attackerStats['double-hit-chance'])) {
            hit = hitSimulation(attackerStats, defenderStats);
            scoreAttacker += hit[1];
            defenderLife -= hit[1];
            if (defenderLife <= 0) {
                scoreAttacker += defenderLife;
                break;
            }
        }

        hit = hitSimulation(defenderStats, attackerStats);
        scoreDefender += hit[1];
        attackerLife -= hit[1];
        if (attackerLife <= 0) {
            scoreDefender += attackerLife;
            break;
        }

        if (chanceRoll(defenderStats['double-hit-chance'])) {
            hit = hitSimulation(defenderStats, attackerStats);
            scoreDefender += hit[1];
            attackerLife -= hit[1];
            if (attackerLife <= 0) {
                scoreDefender += attackerLife;
                break;
            }
        }

        rounds += 1;
    }

    if (attackerLife < 0) attackerLife = 0;
    if (defenderLife < 0) defenderLife = 0;
    const score = scoreAttacker - scoreDefender;

    if (defenderLife <= 0 || score > 0) return 1;
    if (score === 0) return 0;
    return -1;
}

/**
 * Run Monte Carlo arena simulations.
 * @param {object} attacker raw stats from bot
 * @param {object} defender raw stats from bot
 * @param {object} [options]
 * @returns {{ winChance: number, loseChance: number, drawChance: number, details?: object } | { error: string }}
 */
function simulateArena(attacker, defender, options = {}) {
    const attackerStats = normalizePlayerStats(attacker);
    if (attackerStats.error) {
        return { error: attackerStats.message || 'Player stats error.' };
    }
    const defenderStats = normalizePlayerStats(defender);
    if (defenderStats.error) {
        return { error: defenderStats.message || 'Player stats error.' };
    }

    let lifeMode = 'current';
    if (options['life-mode'] === 'full' || options.lifeMode === 'full') lifeMode = 'full';
    else if (
        options['life-mode'] === 'unlimited' ||
        options.lifeMode === 'unlimited' ||
        options['life-mode'] === 'ignore'
    ) {
        lifeMode = 'unlimited';
    }

    let simulates = toNum(options.simulates != null ? options.simulates : DEFAULT_SIMULATES, DEFAULT_SIMULATES);
    if (simulates <= 0) simulates = DEFAULT_SIMULATES;
    if (simulates > 10000) simulates = 10000;

    let rounds = 15;
    const optRounds = toNum(options.rounds, 15);
    if (optRounds > 0 && optRounds <= 50) rounds = optRounds;

    const attackerReady = calculateChances(attackerStats, defenderStats);
    const defenderReady = calculateChances(defenderStats, attackerStats);

    let wins = 0;
    let draws = 0;
    let fights = 0;

    while (fights < simulates) {
        const result = simulateBattle(attackerReady, defenderReady, lifeMode, rounds);
        if (result === 1) wins += 1;
        else if (result === 0) draws += 1;
        fights += 1;
    }

    const winChance = Math.round((wins / fights) * 10000) / 100;
    const drawChance = Math.round((draws / fights) * 10000) / 100;
    const loseChance = Math.round(((fights - wins - draws) / fights) * 10000) / 100;

    return {
        winChance,
        loseChance,
        drawChance,
        // aliases for compatibility with DinoDevs / other clients
        'win-chance': winChance,
        'lose-chance': loseChance,
        'draw-chance': drawChance,
        details: {
            fights,
            wins,
            loses: fights - wins - draws,
            draws,
            engine: 'dinodevs-local',
        },
    };
}

module.exports = {
    simulateArena,
    normalizePlayerStats,
    DEFAULT_SIMULATES,
};
