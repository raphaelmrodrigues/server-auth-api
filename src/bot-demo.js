(function () {
    var root = document.getElementById('gld-demo-root');
    if (!root || !window.GLD_DEMO) return;

    var data = window.GLD_DEMO;
    var ICONS = {
        news_settings: 'fa-newspaper',
        encyclopedia_settings: 'fa-book',
        expedition_settings: 'fa-mountain',
        dungeon_settings: 'fa-dungeon',
        arena_settings: 'fa-chess-knight',
        circus_settings: 'fa-users',
        underworld_settings: 'fa-skull',
        quests_settings: 'fa-shield-halved',
        heal_settings: 'fa-flask',
        event_expedition_settings: 'fa-star',
        auto_auction_settings: 'fa-magnifying-glass',
        auto_auction2_settings: 'fa-gavel',
        auto_smelt_settings: 'fa-fire',
        auto_forge_settings: 'fa-hammer',
        auto_repair_settings: 'fa-wrench',
        Market: 'fa-bag-shopping',
        guild_settings: 'fa-building-columns',
        Timers: 'fa-hourglass-half',
        other_settings2: 'fa-wand-magic-sparkles',
        other_settings: 'fa-gear',
        Extra: 'fa-key',
        'gld-messages': 'fa-envelope'
    };
    var START_ON = {
        doExpedition: true,
        doArena: true,
        doQuests: true,
        doHeal: true,
        activateSmelt: true,
        activateRepair: true
    };
    var LANGS = [
        { id: 'gb', code: 'gb', title: 'English' },
        { id: 'pl', code: 'pl', title: 'Polski' },
        { id: 'es', code: 'es', title: 'Español' },
        { id: 'tr', code: 'tr', title: 'Türkçe' },
        { id: 'fr', code: 'fr', title: 'Français' },
        { id: 'hu', code: 'hu', title: 'Magyar' },
        { id: 'br', code: 'br', title: 'Português' }
    ];
    var ACTION_CYCLE = [
        { need: 'doExpedition', name: 'Expedition', text: 'Expedition: opening combat report' },
        { need: 'doArena', name: 'Arena', text: 'Successfully attacked player in ARENA: HeiusCapone' },
        { need: 'doHeal', name: 'Heal', text: 'Foods have been picked. Ending the process.' },
        { need: 'doQuests', name: 'Quests', text: 'Accepted arena quest' },
        { need: 'activateSmelt', name: 'Smelt', text: 'Smelting loop finished. Reloading page.' },
        { need: 'activateRepair', name: 'Repair', text: 'Trying to move repaired item to the equpiment.' },
        { need: 'doDungeon', name: 'Dungeon', text: 'Dungeon: opening combat report' },
        { need: 'doCircus', name: 'Circus', text: 'Successfully attacked player in CIRCUS: Convictas' },
        { need: 'autoEnterHell', name: 'Underworld', text: 'Underworld: bot restored after enter (login or page reload).' },
        { need: 'activateForge', name: 'Forge', text: 'Started recipe in slot 1' }
    ];
    var EXTRA_LOGS = [
        'Successfully attacked player in ARENA: Marcus_BR',
        'Expedition: opening combat report',
        'Getting food from packages.',
        'Store has been refreshed.',
        'Bid placed successfully.',
        'Moved item Sword of Hate to inventory.',
        'Magus: Attempting to upgrade',
        'Used working cloth to reduce travel time'
    ];

    var state = {
        tab: 'expedition_settings',
        lang: 'gb',
        running: true,
        mods: {},
        startedAt: Date.now(),
        nextIdx: 0,
        nextLeft: 8,
        questCount: 1
    };
    data.tabs.forEach(function (tab) {
        if (tab.toggle) state.mods[tab.toggle] = !!START_ON[tab.toggle];
    });

    function esc(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function pad(n) {
        return String(n).padStart(2, '0');
    }

    function clock(ms) {
        var s = Math.max(0, Math.floor(ms / 1000));
        var h = Math.floor(s / 3600);
        var m = Math.floor((s % 3600) / 60);
        var sec = s % 60;
        return pad(h) + ':' + pad(m) + ':' + pad(sec);
    }

    function hm() {
        var now = new Date();
        return pad(now.getHours()) + ':' + pad(now.getMinutes());
    }

    function flagsHtml() {
        return LANGS.map(function (l) {
            return '<button type="button" class="gld-demo-flag' + (l.id === state.lang ? ' is-active' : '') + '" data-lang="' + l.id + '" title="' + l.title + '"><span class="fi fi-' + l.code + '"></span></button>';
        }).join('');
    }

    function tabsHtml() {
        return '<div class="gld-demo-mod-label">Módulos</div>' + data.tabs.map(function (tab) {
            var sw = tab.toggle
                ? '<label class="gld-demo-switch" onclick="event.stopPropagation()"><input type="checkbox" data-mod="' + tab.toggle + '"' + (state.mods[tab.toggle] ? ' checked' : '') + '><span></span></label>'
                : '';
            return '<button type="button" class="gld-demo-tab' + (tab.target === state.tab ? ' is-active' : '') + '" data-tab="' + tab.target + '">' +
                '<i class="fas ' + (ICONS[tab.target] || 'fa-circle') + '"></i>' +
                '<span>' + esc(tab.label) + '</span>' + sw +
                '</button>';
        }).join('');
    }

    function enabledActions() {
        var list = ACTION_CYCLE.filter(function (a) { return !a.need || state.mods[a.need]; });
        return list.length ? list : [{ name: 'Idle', text: 'Select action: [Exp|Dungeon|Arena|Circus] etc.' }];
    }

    function currentAction() {
        var list = enabledActions();
        return list[state.nextIdx % list.length];
    }

    function oilRow(name, key) {
        return '<tr><th>' + name + '</th><td><div class="radio-group">' +
            '<label><input type="radio" name="' + key + '" value="0"> I</label>' +
            '<label><input type="radio" name="' + key + '" value="1"> II</label>' +
            '<label><input type="radio" name="' + key + '" value="2"> III</label>' +
            '<label><input type="radio" name="' + key + '" value="3" checked> Off</label>' +
            '</div></td></tr>';
    }

    function buffRow(label, prefix, extra) {
        var items = extra || ['Flask', 'Ampulla', 'Flacon', 'Bottle'];
        return '<div class="buff-group"><span class="buff-stat">' + label + '</span>' + items.map(function (name, i) {
            return '<label><input type="checkbox" id="gd-' + prefix + (i + 1) + '"> ' + name + '</label>';
        }).join('') + '</div>';
    }

    function healHtml() {
        return '' +
            '<div class="settings_tab_title">Heal Settings</div>' +
            '<div class="gld-heal-grid">' +
                '<div class="setting-row"><label for="gd-healPercentage">Heal Percentage</label><input type="number" id="gd-healPercentage" min="1" max="99" value="50"></div>' +
                '<div class="setting-row"><label for="gd-HealPickBag">Heal Pick Bag</label><select id="gd-HealPickBag">' + [1,2,3,4,5,6,7,8].map(function (n) { return '<option value="' + n + '">' + n + '</option>'; }).join('') + '</select></div>' +
                '<div class="setting-row"><label for="gd-FoodAmount">How many food to buy/pick?</label><select id="gd-FoodAmount">' + Array.from({ length: 16 }, function (_, i) { return '<option value="' + (i + 1) + '">' + (i + 1) + '</option>'; }).join('') + '</select></div>' +
                '<div class="setting-row"><label for="gd-healShopToggle">Buy Food from Shop?</label><label class="toggle-switch"><input type="checkbox" id="gd-healShopToggle"><span class="switch"></span></label></div>' +
                '<div class="setting-row"><label for="gd-healfrompackage">Use Heal from Package?</label><label class="toggle-switch"><input type="checkbox" id="gd-healfrompackage" checked><span class="switch"></span></label></div>' +
                '<div class="setting-row"><label for="gd-HealClothToggle">Use Clothes to renew Shop?</label><label class="toggle-switch"><input type="checkbox" id="gd-HealClothToggle"><span class="switch"></span></label></div>' +
                '<div class="setting-row"><label for="gd-HealRubyToggle">Use ruby if there isnt cloth?</label><label class="toggle-switch"><input type="checkbox" id="gd-HealRubyToggle"><span class="switch"></span></label></div>' +
                '<div class="setting-row" data-tooltip="This option will use cervisia when your premium expires."><label for="gd-healcervisia">Use Cervisia? (packages included)</label><label class="toggle-switch"><input type="checkbox" id="gd-healcervisia"><span class="switch"></span></label></div>' +
            '</div>' +
            '<div class="settings_tab_title">Allow eating eggs</div>' +
            '<div class="gld-egg-grid">' +
                [['23', 'Life Egg'], ['24', 'Simple Life Egg'], ['25', 'Coloured Life Egg'], ['26', 'Patterned Life Egg'], ['27', 'Golden Life Egg'], ['29', 'Ruby Life Egg'], ['31', 'Easter Egg']].map(function (egg) {
                    return '<label><input type="checkbox" id="gd-HealEgg' + egg[0] + '"> ' + egg[1] + '</label>';
                }).join('') +
            '</div>' +
            '<div class="settings_tab_title">Holy Oils</div>' +
            '<span class="span-new">Bot will check oils every 60 minutes</span>' +
            '<div class="setting-row"><label for="gd-OilEnable">Enable Auto Oil</label><label class="toggle-switch"><input type="checkbox" id="gd-OilEnable"><span class="switch"></span></label></div>' +
            '<div class="setting-row"><table class="gld-oil-table"><thead><tr><th>God</th><th>Oil</th></tr></thead><tbody>' +
                oilRow('Minerva', 'minerva') + oilRow('Diana', 'diana') + oilRow('Mars', 'mars') +
                oilRow('Merkur', 'merkur') + oilRow('Apollo', 'apollo') + oilRow('Vulcanus', 'vulcanus') +
            '</tbody></table></div>' +
            '<div id="gd-oilUsageSettings" class="oil-usage-settings" style="display:none;">' +
                '<div class="settings_tab_title">Oil Usage Options</div>' +
                '<table class="gld-oil-table"><thead><tr><th>Oil</th><th>Rings</th><th>Necklace</th><th>Weapons</th><th>Armor</th></tr></thead><tbody>' +
                [['Blue', 'blue'], ['Yellow', 'yellow'], ['Orange', 'orange'], ['Green', 'green'], ['Purple', 'purple'], ['Red', 'red']].map(function (oil) {
                    var weapon = oil[1] === 'blue' || oil[1] === 'orange' ? ' disabled' : '';
                    return '<tr><td>' + oil[0] + ' Oil</td>' +
                        '<td><input type="checkbox" id="gd-' + oil[1] + '-oil-rings"></td>' +
                        '<td><input type="checkbox" id="gd-' + oil[1] + '-oil-necklace"></td>' +
                        '<td><input type="checkbox"' + (weapon ? weapon : ' id="gd-' + oil[1] + '-oil-weapons"') + '></td>' +
                        '<td><input type="checkbox"' + (weapon ? weapon : ' id="gd-' + oil[1] + '-oil-armor"') + '></td></tr>';
                }).join('') +
                '</tbody></table>' +
            '</div>' +
            '<div class="settings_tab_title">Auto Buff</div>' +
            '<span class="span-new">Bot will use buffs when available.</span>' +
            '<div class="gld-heal-grid">' +
                '<div class="setting-row"><label for="gd-BuffsEnable">Enable Auto Buff</label><label class="toggle-switch"><input type="checkbox" id="gd-BuffsEnable"><span class="switch"></span></label></div>' +
                '<div class="setting-row"><label for="gd-BuffUnderworldOnly">Use it in hell only?</label><label class="toggle-switch"><input type="checkbox" id="gd-BuffUnderworldOnly"><span class="switch"></span></label></div>' +
            '</div>' +
            '<div class="setting-row">' +
                buffRow('Health', 'HealthBuff', ['Gingko', 'Taigaroot', 'Hawthorn']) +
                buffRow('Strength', 'StrengthBuff') +
                buffRow('Dexterity', 'DexterityBuff') +
                buffRow('Agility', 'AgilityBuff') +
                buffRow('Constitution', 'ConstitutionBuff') +
                buffRow('Charisma', 'CharismaBuff') +
                buffRow('Intelligence', 'IntelligenceBuff') +
            '</div>';
    }

    function layoutQuests(html) {
        return html
            .replace(' style="display:none;"', '')
            .replace('class="quest-rule-template"', 'class="quest-rule-template gld-quest-card"')
            .replace('<span class="quest-rule-title">Quest Rule</span>', '<span class="quest-rule-title">Rule 1</span>');
    }

    function layoutSearch(html) {
        return html
            .replace('foautoSellAuctionr=""', 'for="gd-autoSellAuction"')
            .replace('onclick="removeItem(\'uniqueItemID\')"', 'type="button" data-demo="remove-item"')
            .replace('<h2>Item Search Settings</h2>', '<div class="settings_tab_title">Item Search Settings</div>');
    }

    function shotHtml(src, alt) {
        return '<div class="gld-demo-shot"><img src="' + src + '" alt="' + esc(alt) + '"></div>';
    }

    function forgeHtml() {
        var quals = [['white', 'White'], ['green', 'Green'], ['blue', 'Blue'], ['purple', 'Purple'], ['orange', 'Orange'], ['red', 'Red']];
        var tools = [['Anvil', 'anvil'], ['Bellows', 'bellows'], ['Clover', 'clover'], ['Hammer (Bag I)', 'hammer']];
        var qOpts = quals.map(function (q, i) { return '<option value="' + i + '"' + (i === 1 ? ' selected' : '') + '>' + q[1] + '</option>'; }).join('');
        return '' +
            '<div class="settings_tab_title">Auto Forge</div>' +
            '<div class="setting-row"><label>Status</label><span class="span-new" style="margin:0">Idle · 6 slots free</span><button type="button" class="gld-btn">Refresh scrolls</button></div>' +
            '<div class="setting-row"><label>Pause while in Underworld</label><label class="toggle-switch"><input type="checkbox" id="gd-gldForgePauseUw" checked><span class="switch"></span></label></div>' +
            '<div class="setting-row"><label>Min gold to forge</label><input type="number" id="gd-gldForgeMinGold" min="0" value="0"></div>' +
            '<div class="settings_tab_title">Select recipe</div>' +
            '<div class="setting-row"><label>Item type</label><select id="gd-forgeType"><option>-- type --</option><option>Weapons</option><option>Shields</option><option>Armour</option><option>Helmets</option><option>Gloves</option><option>Boots</option><option>Rings</option><option>Amulets</option></select></div>' +
            '<div class="setting-row"><label>Base item</label><select id="gd-forgeBasis"><option>-- item --</option><option>(4lvl) Sword</option><option>(6lvl) Helmet</option><option>(5lvl) Armour</option></select></div>' +
            '<div class="setting-row"><label>Prefix</label><select id="gd-forgePrefix"><option>-- none --</option><option>of Hate</option><option>of Power</option><option>of the Sun</option></select></div>' +
            '<div class="setting-row"><label>Suffix</label><select id="gd-forgeSuffix"><option>-- none --</option><option>of Glory</option><option>of the Woods</option></select></div>' +
            '<div class="settings_tab_title">Qualities to count</div>' +
            '<div class="setting-row"><div class="gld-forge-q">' + quals.map(function (q) {
                return '<label><input type="checkbox" checked> <span class="color-circle ' + q[0] + '"></span> ' + q[1] + '</label>';
            }).join('') + '</div></div>' +
            '<div class="settings_tab_title">Materials to use</div>' +
            '<div class="setting-row"><label>Preferred quality</label><select>' + qOpts + '</select></div>' +
            '<div class="setting-row"><label>Minimum quality</label><select>' + qOpts + '</select></div>' +
            '<div class="settings_tab_title">Tools (optional)</div>' +
            tools.map(function (t) {
                return '<div class="setting-row"><label>' + t[0] + '</label><label><input type="checkbox" id="gd-forge-' + t[1] + '"> Use</label><select disabled><option>Bronze</option><option>Silver</option><option selected>Gold</option></select></div>';
            }).join('') +
            '<div class="settings_tab_title">Recipe details</div>' +
            '<div class="setting-row"><div class="gld-forge-details" id="gd-forgeDetails">Select a recipe first.</div></div>' +
            '<div class="setting-row"><label>How many:</label><input type="number" min="1" value="1" style="width:70px"></div>' +
            '<div class="setting-row"><label>Destination:</label><select><option>Inventory</option><option>Packages</option></select></div>' +
            '<div class="setting-row"><label>Allowed slots:</label><div class="gld-forge-q">' + [1,2,3,4,5,6].map(function (n) {
                return '<label><input type="checkbox" checked> ' + n + '</label>';
            }).join('') + '</div></div>' +
            '<div class="setting-row"><button type="button" class="gld-btn">Forge now</button><button type="button" class="gld-btn" id="gd-forgeSaveRule">Save as rule</button></div>' +
            '<div class="settings_tab_title">Auto-forge rules</div>' +
            '<p class="span-new">With Forja ON and the bot running, active rules keep forging until success count reaches the target. Then they stop. Reset counters or raise the target to continue.</p>' +
            '<div class="setting-row"><div class="gld-forge-rules" id="gd-forgeRules"><div class="gld-forge-rule"><strong>Rule 1 — Sword of Hate</strong><div>Pref: Blue · Min: Green · Slots 1–6 · Inventory</div></div></div></div>' +
            '<div class="setting-row"><button type="button" class="gld-btn" id="gd-forgeAddRule">+ Add empty rule</button><button type="button" class="gld-btn">Run now</button></div>' +
            '<p class="span-new">Runs one cycle now: collects finished items and starts active rules. The Forja toggle must be on.</p>' +
            '<div class="settings_tab_title">Forged items (protected from smelting)</div>' +
            '<p class="span-new">Items created by Auto-Forge are never smelted, even if they match a smelt rule. Remove protection to smelt them again.</p>' +
            '<div class="setting-row"><div class="gld-forge-prot">No protected forged items yet.</div></div>' +
            '<div class="settings_tab_title">Horreum stock</div>' +
            '<div class="setting-row"><div class="gld-forge-horreum">Open Gladiatus with the bot to load live material counts.</div></div>';
    }

    function malefikaHtml() {
        return ['Bronze', 'Silver', 'Gold'].map(function (q) {
            return '<div class="setting-row malefika-tier">' +
                '<label><input type="checkbox" class="malefika-buy-enabled"> ' + q + '</label>' +
                '<div class="malefika-type-icons">' +
                    '<button type="button" class="gld-type-chip" data-malefika-type="anvil">Anvil</button>' +
                    '<button type="button" class="gld-type-chip" data-malefika-type="bellows">Bellows</button>' +
                    '<button type="button" class="gld-type-chip" data-malefika-type="clover">Clover</button>' +
                    '<button type="button" class="gld-type-chip" data-malefika-type="hammer">Hammer</button>' +
                '</div>' +
                '<input type="number" class="malefika-buy-max-price" placeholder="Max price" min="0">' +
                '</div>';
        }).join('') +
            '<div class="settings_tab_title">Bought Items</div>' +
            '<div class="setting-row"><select id="gd-MarketboughtItems" size="4" style="width:100%"><option>Demo: Golden Anvil of Calibre — 12,500</option></select><button type="button" class="gld-btn" id="gd-MarketremoveItemBtn">Clear</button></div>';
    }

    function paintPane() {
        var pane = document.getElementById('gld-demo-pane');
        var html = data.boxes[state.tab] || '<p class="span-new">This module has no extra options.</p>';
        if (state.tab === 'quests_settings') html = layoutQuests(html);
        else if (state.tab === 'heal_settings') html = healHtml();
        else if (state.tab === 'auto_auction_settings') html = layoutSearch(html);
        else if (state.tab === 'auto_forge_settings') html = forgeHtml();
        else if (state.tab === 'news_settings') html = shotHtml('./images/noticias.png', 'News & microevents');
        else if (state.tab === 'encyclopedia_settings') html = shotHtml('./images/enciclopedia.png', 'Forge encyclopedia');
        pane.innerHTML = html;
        pane.classList.toggle('is-shot', state.tab === 'news_settings' || state.tab === 'encyclopedia_settings');
        pane.scrollTop = 0;
        enhancePane(pane);
        wireInnerTabs(pane);
        wirePaneExtras(pane);
    }

    function replaceIcon(el, cls) {
        var name = el.getAttribute('alt') || el.getAttribute('title') || el.getAttribute('data-hammer') || '';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = cls;
        if (el.getAttribute('data-type')) btn.setAttribute('data-type', el.getAttribute('data-type'));
        if (el.getAttribute('data-hammer')) btn.setAttribute('data-hammer', el.getAttribute('data-hammer'));
        btn.textContent = name.replace(/^./, function (c) { return c.toUpperCase(); }) || 'Item';
        el.replaceWith(btn);
    }

    function enhancePane(pane) {
        pane.querySelectorAll('.rule-row-template, .market-rule-row-template').forEach(function (el) {
            el.style.display = '';
            el.classList.add('gld-rule-card');
        });
        pane.querySelectorAll('.item-icon, .item-icon2, .market-item-icon').forEach(function (el) {
            replaceIcon(el, 'gld-type-chip');
        });
        pane.querySelectorAll('[data-hammer]').forEach(function (el) {
            if (el.matches('button')) return;
            replaceIcon(el, 'gld-hammer-chip');
        });
        var slots = {
            'gd-weapon': 'Weapon', 'gd-helmet': 'Helmet', 'gd-armor': 'Armour', 'gd-shield': 'Shield',
            'gd-gloves': 'Gloves', 'gd-shoes': 'Boots', 'gd-rings1': 'Ring 1', 'gd-rings2': 'Ring 2', 'gd-necklace': 'Amulet',
            'gd-weaponM': 'Weapon', 'gd-helmetM': 'Helmet', 'gd-armorM': 'Armour', 'gd-shieldM': 'Shield',
            'gd-glovesM': 'Gloves', 'gd-shoesM': 'Boots', 'gd-rings1M': 'Ring 1', 'gd-rings2M': 'Ring 2', 'gd-necklaceM': 'Amulet'
        };
        Object.keys(slots).forEach(function (id) {
            var item = pane.querySelector('#' + id);
            if (item && !item.textContent.trim()) item.textContent = slots[id];
        });
        if (state.tab === 'Market' && !pane.querySelector('.malefika-buy-enabled')) {
            pane.insertAdjacentHTML('beforeend', malefikaHtml());
        }
        fillList(pane, '#gd-AuctionprefixList', ['of Hate', 'of Power']);
        fillList(pane, '#gd-AuctionsuffixList', ['of Glory']);
        fillList(pane, '#gd-IgnoredprefixList', ['of Shame']);
        fillList(pane, '#gd-bidList', ['Sword of Hate — 25 gold']);
        fillStatTable(pane);
        fillTimers(pane);
        fillExtras(pane);
        fillSchedule(pane);
    }

    function fillList(pane, sel, items) {
        var list = pane.querySelector(sel);
        if (!list || list.children.length) return;
        items.forEach(function (t) {
            var li = document.createElement('li');
            li.innerHTML = esc(t) + ' <button type="button" class="gld-list-x">×</button>';
            list.appendChild(li);
        });
    }

    function fillStatTable(pane) {
        var body = pane.querySelector('#gd-statTable tbody');
        if (!body || body.children.length) return;
        ['Strength', 'Dexterity', 'Agility', 'Constitution', 'Charisma', 'Intelligence'].forEach(function (stat, i) {
            body.insertAdjacentHTML('beforeend',
                '<tr><td><input type="checkbox"' + (i === 0 ? ' checked' : '') + '></td><td>' + stat +
                '</td><td><input type="number" min="0" value="' + (i === 0 ? '10' : '0') + '" style="width:4rem"></td>' +
                '<td><input type="number" min="0" value="' + (i === 0 ? '1' : '') + '" placeholder="-" style="width:3.5rem"></td></tr>');
        });
    }

    function fillTimers(pane) {
        pane.querySelectorAll('.timer-input').forEach(function (input) {
            if (!input.value) input.value = input.getAttribute('min') || '1';
        });
    }

    function fillExtras(pane) {
        var map = {
            'gd-kydt': 'DEMO-XXXX-TRIAL',
            'gd-kydtexp': 'demo',
            'gd-stats-tracking-since': 'Tracking since demo start',
            'gd-items-repaired': '12',
            'gd-items-reset': '4',
            'gd-gold-cycled': '128,400',
            'gd-arena-attacks': '38',
            'gd-circus-attacks': '11',
            'gd-dungeons-attacked': '7',
            'gd-expeditions-attacked': '54',
            'gd-items-smelted': '23',
            'gd-underworld-attacks': '0',
            'gd-arena-money': '9,150',
            'gd-circus-money': '2,040'
        };
        Object.keys(map).forEach(function (id) {
            var el = pane.querySelector('#' + id);
            if (el) el.textContent = map[id];
        });
        var date = pane.querySelector('#gd-dailyStatsDate');
        if (date && !date.options.length) {
            date.innerHTML = '<option>Today</option><option>Yesterday</option>';
        }
    }

    function fillSchedule(pane) {
        var box = pane.querySelector('#gd-scheduleWindows');
        if (!box || box.children.length) return;
        box.innerHTML =
            '<div class="gld-sched-row"><b>Active</b> <input type="time" value="08:00"> → <input type="time" value="23:00"> <button type="button" class="gld-list-x">×</button></div>' +
            '<div class="gld-sched-row"><b>Disable</b> <input type="time" value="03:00"> → <input type="time" value="06:00"> <button type="button" class="gld-list-x">×</button></div>';
        var now = pane.querySelector('#gd-scheduleNowLabel');
        if (now) now.textContent = 'Local time ' + hm();
        var status = pane.querySelector('#gd-scheduleStatus');
        if (status) status.textContent = 'Demo: schedule windows are interactive only.';
        var ind = pane.querySelector('#gd-scheduleTabIndicatorText');
        if (ind) ind.textContent = 'This tab is controlling the bot';
    }

    function bindAddList(pane, inputSel, btnSel, listSel) {
        var input = pane.querySelector(inputSel);
        var btn = pane.querySelector(btnSel);
        var list = pane.querySelector(listSel);
        if (!btn || !list) return;
        function add() {
            var v = input ? (input.value || '').trim() : '';
            if (input && !v) return;
            var li = document.createElement(list.tagName === 'UL' ? 'li' : 'div');
            li.innerHTML = esc(v || 'Item') + ' <button type="button" class="gld-list-x">×</button>';
            list.appendChild(li);
            if (input) input.value = '';
        }
        btn.addEventListener('click', add);
        if (input) input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); add(); }
        });
    }

    function cloneCard(pane, templateSel, intoSel, titleSel, label) {
        var card = pane.querySelector(templateSel);
        if (!card) return;
        var clone = card.cloneNode(true);
        clone.style.display = '';
        var title = clone.querySelector(titleSel);
        if (title) {
            if (title.tagName === 'INPUT') title.value = label;
            else title.textContent = label;
        }
        var into = pane.querySelector(intoSel) || card.parentElement;
        if (into) into.appendChild(clone);
    }

    function wirePaneExtras(pane) {
        var pri = pane.querySelector('#gd-questPriorityMode');
        var sec = pane.querySelector('#gd-questThresholdSection');
        if (pri && sec) {
            pri.addEventListener('change', function () {
                sec.style.display = pri.value === 'thresholdXpPerAttack' ? '' : 'none';
            });
        }
        [
            ['#gd-OilEnable', '#gd-oilUsageSettings'],
            ['#gd-autoBuyBackground', '#gd-autoBuyBgCooldownRow'],
            ['#gd-enableMercenarySearch', '#gd-mercenarySearchOptions'],
            ['#gd-underworldEntryCostume', '#gd-underworldEntryCostumeWrapper'],
            ['#gd-wearUnderworld', '#gd-costumeUnderworldWrapper'],
            ['#gd-useGodPowers', '#gd-godPowersSection']
        ].forEach(function (pair) {
            var a = pane.querySelector(pair[0]);
            var b = pane.querySelector(pair[1]);
            if (!a || !b) return;
            a.addEventListener('change', function () { b.style.display = a.checked ? '' : 'none'; });
        });
        pane.querySelectorAll('.select-all, .deselect-all').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var target = btn.getAttribute('data-target') || 'quality';
                var cls = target === 'type' ? 'type-option' : 'quality-option';
                var on = btn.classList.contains('select-all');
                pane.querySelectorAll('.' + cls).forEach(function (cb) { cb.checked = on; });
            });
        });
        var addQuest = pane.querySelector('#gd-addQuestRuleNew');
        if (addQuest) {
            addQuest.addEventListener('click', function () {
                state.questCount += 1;
                cloneCard(pane, '.quest-rule-template', '#gd-questRulesListNew', '.quest-rule-title', 'Rule ' + state.questCount);
            });
        }
        var resetRules = pane.querySelector('#gd-resetQuestRulesNew');
        if (resetRules) {
            resetRules.addEventListener('click', function () {
                pane.querySelectorAll('#gd-questRulesListNew .quest-rule-template').forEach(function (n) { n.remove(); });
                state.questCount = 1;
                var title = pane.querySelector('.quest-rule-container > .quest-rule-template .quest-rule-title');
                if (title) title.textContent = 'Rule 1';
            });
        }
        var addSmelt = pane.querySelector('.add-rule-btn');
        if (addSmelt) {
            addSmelt.addEventListener('click', function () {
                cloneCard(pane, '.rule-row-template', '.rule-container', '.rule-prefix-input', '');
            });
        }
        var marketAdd = pane.querySelector('#gd-market-add-rule');
        if (marketAdd) {
            marketAdd.addEventListener('click', function () {
                cloneCard(pane, '.market-rule-row-template', '#gd-market-rule-container', '.market-rule-title', 'New rule');
            });
        }
        var forgeAdd = pane.querySelector('#gd-forgeAddRule');
        if (forgeAdd) {
            forgeAdd.addEventListener('click', function () {
                var box = pane.querySelector('#gd-forgeRules');
                if (!box) return;
                box.insertAdjacentHTML('beforeend', '<div class="gld-forge-rule"><strong>Empty rule</strong><div>Set a recipe, then Save as rule.</div></div>');
            });
        }
        var forgeSave = pane.querySelector('#gd-forgeSaveRule');
        if (forgeSave) {
            forgeSave.addEventListener('click', function () {
                var box = pane.querySelector('#gd-forgeRules');
                var basis = pane.querySelector('#gd-forgeBasis');
                var name = (basis && basis.value && basis.value !== '-- item --') ? basis.options[basis.selectedIndex].text : 'New recipe';
                if (box) box.insertAdjacentHTML('beforeend', '<div class="gld-forge-rule"><strong>' + esc(name) + '</strong><div>Saved from planner · Inventory</div></div>');
            });
        }
        pane.querySelectorAll('input[id^="gd-forge-"]').forEach(function (cb) {
            cb.addEventListener('change', function () {
                var row = cb.closest('.setting-row');
                var sel = row && row.querySelector('select');
                if (sel) sel.disabled = !cb.checked;
            });
        });
        var basis = pane.querySelector('#gd-forgeBasis');
        if (basis) {
            basis.addEventListener('change', function () {
                var details = pane.querySelector('#gd-forgeDetails');
                if (!details) return;
                details.textContent = basis.value && basis.value !== '-- item --'
                    ? (basis.options[basis.selectedIndex].text + ' · Success chance: 62% · Duration: 12min')
                    : 'Select a recipe first.';
            });
        }
        bindAddList(pane, '#gd-AuctionnewPrefixInput', '#gd-AuctionaddPrefixButton', '#gd-AuctionprefixList');
        bindAddList(pane, '#gd-AuctionnewSuffixInput', '#gd-AuctionaddSuffixButton', '#gd-AuctionsuffixList');
        bindAddList(pane, '#gd-newIgnoredPrefixInput', '#gd-IgnoredaddPrefixButton', '#gd-IgnoredprefixList');
        bindAddList(pane, '#gd-newIgnoredSuffixInput', '#gd-IgnoredaddSuffixButton', '#gd-IgnoredsuffixList');
        bindAddList(pane, '#gd-autoAttackInput', '#gd-addAutoAttack', '#gd-autoAttackList');
        bindAddList(pane, '#gd-autoAttackServerInput', '#gd-addAutoAttackServer', '#gd-autoAttackServerList');
        bindAddList(pane, '#gd-avoidAttackInput', '#gd-addAvoidAttack', '#gd-avoidAttackList');
        bindAddList(pane, '#gd-autoAttackCircusInput', '#gd-addAutoCircusAttack', '#gd-autoAttackCircusList');
        bindAddList(pane, '#gd-autoAttackCircusServerInput', '#gd-addAutoCircusAttackServer', '#gd-autoAttackCircusServerList');
        bindAddList(pane, '#gd-avoidAttackCircusInput', '#gd-addAvoidCircusAttack', '#gd-avoidAttackCircusList');
        bindAddList(pane, '#gd-keywordGuildInput', '#gd-addGuildKeywordBtn', '#gd-keywordGuildList');
        ['#gd-ClearAttackList', '#gd-ClearOtherAttackList', '#gd-ClearAvoidList', '#gd-ClearCircusAttackList', '#gd-ClearOtherCircusAttackList', '#gd-ClearCircusAvoidList', '#gd-clearBidItemsHistory', '#gd-clearSmeltedItemsHistory', '#gd-MarketremoveItemBtn'].forEach(function (sel) {
            var btn = pane.querySelector(sel);
            if (!btn) return;
            btn.addEventListener('click', function () {
                var box = btn.closest('.setting-row, .avoid-attack, .table-container') || pane;
                var list = box.querySelector('ul, select');
                if (list) list.innerHTML = '';
            });
        });
        var gold = pane.querySelector('#gd-magusChanceGold');
        var ruby = pane.querySelector('#gd-magusChanceRubies');
        function syncMagus() {
            var g = gold ? parseInt(gold.value, 10) || 0 : 0;
            var r = ruby ? parseInt(ruby.value, 10) || 0 : 0;
            if (g + r > 100 && ruby) { ruby.value = String(Math.max(0, 100 - g)); r = parseInt(ruby.value, 10); }
            var gt = pane.querySelector('#gd-magusGoldValueText');
            var rt = pane.querySelector('#gd-magusRubyValueText');
            if (gt) gt.textContent = String(g);
            if (rt) rt.textContent = String(r);
        }
        if (gold) gold.addEventListener('input', syncMagus);
        if (ruby) ruby.addEventListener('input', syncMagus);
        var selectAll = pane.querySelector('#gd-selectAllItems');
        if (selectAll) {
            selectAll.addEventListener('click', function () {
                pane.querySelectorAll('#gd-itemsToReset input[type="checkbox"]').forEach(function (cb) { cb.checked = true; });
            });
        }
        var addWinA = pane.querySelector('#gd-scheduleAddActiveWindow');
        var addWinD = pane.querySelector('#gd-scheduleAddDisableWindow');
        function addWin(kind) {
            var box = pane.querySelector('#gd-scheduleWindows');
            if (!box) return;
            box.insertAdjacentHTML('beforeend', '<div class="gld-sched-row"><b>' + kind + '</b> <input type="time" value="12:00"> → <input type="time" value="13:00"> <button type="button" class="gld-list-x">×</button></div>');
        }
        if (addWinA) addWinA.addEventListener('click', function () { addWin('Active'); });
        if (addWinD) addWinD.addEventListener('click', function () { addWin('Disable'); });
    }

    function wireInnerTabs(pane) {
        var firstTabs = pane.querySelector('.settings_tab_title2');
        if (firstTabs) {
            var buttons = firstTabs.querySelectorAll('.tab-button');
            if (buttons[0]) buttons[0].classList.add('active');
        }
    }

    function showTwin(pane, primary) {
        var map = [
            ['gd-tabA', 'gd-contentA', 'gd-contentB'],
            ['gd-tabB', 'gd-contentB', 'gd-contentA'],
            ['gd-tabACircus', 'gd-contentACircus', 'gd-contentBCircus'],
            ['gd-tabBCircus', 'gd-contentBCircus', 'gd-contentACircus'],
            ['gd-auction-old-tab', 'gd-auction-old', 'gd-auction-new'],
            ['gd-auction-new-tab', 'gd-auction-new', 'gd-auction-old']
        ];
        map.forEach(function (row) {
            if (primary !== row[0]) return;
            var show = pane.querySelector('#' + row[1]);
            var hide = pane.querySelector('#' + row[2]);
            if (show) show.style.display = '';
            if (hide) hide.style.display = 'none';
        });
        var group = pane.querySelector('#' + primary);
        if (group && group.parentElement) {
            group.parentElement.querySelectorAll('.tab-button').forEach(function (b) {
                b.classList.toggle('active', b.id === primary);
            });
        }
    }

    function paintNext() {
        var action = currentAction();
        var name = document.getElementById('gld-demo-next-name');
        var left = document.getElementById('gld-demo-next-left');
        if (name) name.textContent = action.name;
        if (left) left.textContent = clock(state.nextLeft * 1000);
    }

    function paintOnline() {
        var el = document.getElementById('gld-demo-online');
        if (el) el.textContent = clock(Date.now() - state.startedAt);
    }

    function logLine(text) {
        return '<p class="gld-demo-log-line"><time>[' + hm() + ']</time> ' + esc(text) + '</p>';
    }

    function pushLog(text) {
        var body = document.getElementById('gld-demo-log');
        if (!body) return;
        body.insertAdjacentHTML('beforeend', logLine(text));
        while (body.children.length > 40) body.removeChild(body.firstChild);
        body.scrollTop = body.scrollHeight;
    }

    function clearLogs() {
        var body = document.getElementById('gld-demo-log');
        if (body) body.innerHTML = '';
    }

    function askConfirm(message, onYes) {
        var box = document.getElementById('gld-demo-confirm');
        var text = document.getElementById('gld-demo-confirm-text');
        if (!box || !text) return;
        text.textContent = message;
        box.hidden = false;
        box._onYes = onYes;
    }

    function hideConfirm() {
        var box = document.getElementById('gld-demo-confirm');
        if (box) {
            box.hidden = true;
            box._onYes = null;
        }
    }

    root.innerHTML =
        '<div class="gld-demo-stage">' +
            '<div class="gld-demo-panel">' +
                '<header class="gld-demo-head">' +
                    '<span class="gld-demo-ver">Version 4.0.2</span>' +
                    '<span class="gld-demo-exp">Expires: <em>demo</em></span>' +
                    '<div class="gld-demo-badge" aria-hidden="true">GB</div>' +
                    '<div class="gld-demo-langs">' + flagsHtml() + '</div>' +
                    '<div class="gld-demo-head-links">' +
                        '<a href="https://gladiusbot.itch.io/gladiusbot" target="_blank" rel="noopener">Donate</a>' +
                        '<a href="/privacy">Privacy</a>' +
                        '<button type="button" class="gld-demo-buy">Buy</button>' +
                    '</div>' +
                '</header>' +
                '<div class="gld-demo-announce"><span>News</span> Welcome to GladiusBot! Click a module on the left — every option from that tab opens on the right. Demo only.</div>' +
                '<div class="gld-demo-body">' +
                    '<nav class="gld-demo-tabs" aria-label="Modules">' + tabsHtml() + '</nav>' +
                    '<div class="gld-demo-pane" id="gld-demo-pane"></div>' +
                '</div>' +
            '</div>' +
            '<aside class="gld-demo-log-dock" aria-label="Activity log">' +
                '<div class="gld-demo-next">' +
                    '<div class="gld-demo-next-title">Next action: <em id="gld-demo-next-name">Expedition</em></div>' +
                    '<div class="gld-demo-next-row"><span>In</span><strong id="gld-demo-next-left">0:00:08</strong></div>' +
                '</div>' +
                '<div class="gld-demo-log">' +
                    '<div class="gld-demo-online"><span>Online time</span><strong id="gld-demo-online">00:00:00</strong></div>' +
                    '<header>LOG MENU</header>' +
                    '<div class="gld-demo-log-body" id="gld-demo-log"></div>' +
                '</div>' +
                '<div class="gld-demo-log-actions">' +
                    '<button type="button" data-log="clear">Clear Logs</button>' +
                    '<button type="button" data-log="reset">Reset Bot</button>' +
                    '<button type="button" class="is-wide" data-log="timers">Reset Timers</button>' +
                '</div>' +
            '</aside>' +
            '<div class="gld-demo-confirm" id="gld-demo-confirm" hidden>' +
                '<div class="gld-demo-confirm-box">' +
                    '<p id="gld-demo-confirm-text"></p>' +
                    '<div class="gld-demo-log-actions">' +
                        '<button type="button" data-confirm="yes">Yes</button>' +
                        '<button type="button" data-confirm="no">No</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<p class="gld-demo-lang-note" hidden>This homepage demo stays in English. The extension includes English, Portuguese, Spanish, Polish, Turkish, French and Hungarian.</p>';

    paintPane();
    paintNext();
    paintOnline();

    root.addEventListener('click', function (ev) {
        var flag = ev.target.closest('.gld-demo-flag');
        if (flag) {
            state.lang = flag.getAttribute('data-lang');
            root.querySelectorAll('.gld-demo-flag').forEach(function (btn) {
                btn.classList.toggle('is-active', btn === flag);
            });
            root.querySelector('.gld-demo-lang-note').hidden = state.lang === 'gb';
            return;
        }
        var tabBtn = ev.target.closest('.gld-demo-tab');
        if (tabBtn && !ev.target.closest('.gld-demo-switch')) {
            state.tab = tabBtn.getAttribute('data-tab');
            root.querySelector('.gld-demo-tabs').innerHTML = tabsHtml();
            paintPane();
            return;
        }
        if (ev.target.closest('.gld-demo-buy')) {
            var buy = document.getElementById('buyButton');
            if (buy) buy.click();
            return;
        }
        var confirmBtn = ev.target.closest('[data-confirm]');
        if (confirmBtn) {
            var box = document.getElementById('gld-demo-confirm');
            if (confirmBtn.getAttribute('data-confirm') === 'yes' && box && typeof box._onYes === 'function') box._onYes();
            hideConfirm();
            return;
        }
        var logBtn = ev.target.closest('[data-log]');
        if (logBtn) {
            var act = logBtn.getAttribute('data-log');
            if (act === 'clear') {
                clearLogs();
                return;
            }
            if (act === 'reset') {
                askConfirm('Are you sure you want to reset the bot? You may need to enter your license key again!', function () {
                    clearLogs();
                    state.startedAt = Date.now();
                    state.nextLeft = 8;
                    state.nextIdx = 0;
                    paintOnline();
                    paintNext();
                    pushLog('Bot has been paused!');
                    pushLog('Demo panel ready');
                });
                return;
            }
            if (act === 'timers') {
                askConfirm('Reset all bot cooldown timers? Useful when the system clock was wrong and timers got stuck in the future.', function () {
                    state.nextLeft = 8;
                    paintNext();
                    pushLog('Reset 0 timer(s).');
                });
                return;
            }
        }
        var innerTab = ev.target.closest('.tab-button');
        if (innerTab && innerTab.id) {
            showTwin(document.getElementById('gld-demo-pane'), innerTab.id);
            return;
        }
        var removeRule = ev.target.closest('.quest-rule-remove, .gld-list-x, .remove-rule-btn, .market-rule-remove-btn');
        if (removeRule) {
            var card = removeRule.closest('li, .gld-sched-row, .gld-forge-rule, .market-rule-row-template, .rule-row-template, .quest-rule-template');
            if (card) {
                var pane = document.getElementById('gld-demo-pane');
                if (card.classList.contains('quest-rule-template')) {
                    var list = pane.querySelector('#gd-questRulesListNew');
                    if (list && list.contains(card)) card.remove();
                } else if (card.classList.contains('rule-row-template') && pane.querySelectorAll('.rule-row-template').length < 2) {
                    return;
                } else if (card.classList.contains('market-rule-row-template') && pane.querySelectorAll('.market-rule-row-template').length < 2) {
                    return;
                } else {
                    card.remove();
                }
            }
            return;
        }
        var chip = ev.target.closest('.gld-type-chip, .gld-hammer-chip, .color-circle, .color-circle2, .color-circle3');
        if (chip) {
            chip.classList.toggle('selected');
            return;
        }
        var slot = ev.target.closest('.inventory-item');
        if (slot) {
            slot.classList.toggle('active');
            return;
        }
        var pill = ev.target.closest('.monster-button');
        if (pill) {
            var wrap = pill.parentElement;
            wrap.querySelectorAll('.monster-button').forEach(function (b) { b.classList.remove('active'); });
            pill.classList.add('active');
        }
    });

    root.addEventListener('change', function (ev) {
        var input = ev.target;
        if (input.matches('[data-mod]')) {
            state.mods[input.getAttribute('data-mod')] = input.checked;
            var name = (input.getAttribute('data-mod') || 'MOD').replace(/^do|^activate/i, '');
            pushLog((input.checked ? 'Enabled ' : 'Disabled ') + name);
            paintNext();
        }
    });

    root.addEventListener('submit', function (ev) { ev.preventDefault(); });

    pushLog('Demo panel ready');
    pushLog('Successfully attacked player in ARENA: HeiusCapone');
    pushLog('Expedition: opening combat report');

    var tick = 0;
    setInterval(function () {
        if (!state.running) return;
        paintOnline();
        state.nextLeft -= 1;
        if (state.nextLeft <= 0) {
            var action = currentAction();
            pushLog(action.text);
            state.nextIdx += 1;
            state.nextLeft = 8;
            tick += 1;
            if (tick % 3 === 0) {
                var extra = EXTRA_LOGS[tick % EXTRA_LOGS.length];
                if (extra && extra !== action.text) pushLog(extra);
            }
        }
        paintNext();
    }, 1000);

    if (location.hash === '#demo' || location.hash === '#bot-demo') {
        var section = document.getElementById('bot-demo');
        if (section) setTimeout(function () { section.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
    }
})();
