(function (global) {
    var COUNTRIES = [
        { code: 'es', name: 'Spain' },
        { code: 'us', name: 'United States' },
        { code: 'br', name: 'Brazil' },
        { code: 'ca', name: 'Canada' },
        { code: 'fr', name: 'France' },
        { code: 'de', name: 'Germany' },
        { code: 'tr', name: 'Turkey' },
        { code: 'jp', name: 'Japan' },
        { code: 'in', name: 'India' },
        { code: 'cn', name: 'China' },
        { code: 'it', name: 'Italy' },
        { code: 'gb', name: 'United Kingdom' },
        { code: 'ru', name: 'Russia' },
        { code: 'au', name: 'Australia' },
        { code: 'mx', name: 'Mexico' },
        { code: 'kr', name: 'South Korea' },
        { code: 'se', name: 'Sweden' },
        { code: 'no', name: 'Norway' },
        { code: 'nl', name: 'Netherlands' },
        { code: 'ch', name: 'Switzerland' },
        { code: 'pl', name: 'Poland' },
        { code: 'gr', name: 'Greece' },
        { code: 'be', name: 'Belgium' },
        { code: 'pt', name: 'Portugal' },
        { code: 'cz', name: 'Czech Republic' },
        { code: 'at', name: 'Austria' },
        { code: 'dk', name: 'Denmark' },
        { code: 'fi', name: 'Finland' },
        { code: 'ar', name: 'Argentina' },
        { code: 'cl', name: 'Chile' },
        { code: 'co', name: 'Colombia' },
        { code: 've', name: 'Venezuela' },
        { code: 'pe', name: 'Peru' },
        { code: 'uy', name: 'Uruguay' },
        { code: 'ec', name: 'Ecuador' },
        { code: 'sa', name: 'Saudi Arabia' },
        { code: 'ae', name: 'United Arab Emirates' },
        { code: 'kw', name: 'Kuwait' },
        { code: 'qa', name: 'Qatar' },
        { code: 'bh', name: 'Bahrain' },
        { code: 'om', name: 'Oman' },
        { code: 'il', name: 'Israel' },
        { code: 'eg', name: 'Egypt' },
        { code: 'ma', name: 'Morocco' },
        { code: 'tn', name: 'Tunisia' },
        { code: 'ke', name: 'Kenya' },
        { code: 'ng', name: 'Nigeria' },
        { code: 'za', name: 'South Africa' },
        { code: 'dz', name: 'Algeria' },
        { code: 'pk', name: 'Pakistan' },
        { code: 'bd', name: 'Bangladesh' },
        { code: 'lk', name: 'Sri Lanka' },
        { code: 'np', name: 'Nepal' },
        { code: 'mm', name: 'Myanmar' },
        { code: 'kh', name: 'Cambodia' },
        { code: 'vn', name: 'Vietnam' },
        { code: 'th', name: 'Thailand' },
        { code: 'sg', name: 'Singapore' },
        { code: 'my', name: 'Malaysia' },
        { code: 'ph', name: 'Philippines' },
        { code: 'id', name: 'Indonesia' },
        { code: 'ro', name: 'Romania' },
        { code: 'hu', name: 'Hungary' },
        { code: 'bg', name: 'Bulgaria' },
        { code: 'hr', name: 'Croatia' },
        { code: 'rs', name: 'Serbia' },
        { code: 'mk', name: 'North Macedonia' },
        { code: 'ua', name: 'Ukraine' },
        { code: 'sk', name: 'Slovakia' },
        { code: 'lt', name: 'Lithuania' },
        { code: 'ee', name: 'Estonia' },
        { code: 'lv', name: 'Latvia' },
        { code: 'by', name: 'Belarus' },
        { code: 'py', name: 'Paraguay' },
        { code: 'bo', name: 'Bolivia' },
        { code: 'gy', name: 'Guyana' },
        { code: 'sr', name: 'Suriname' },
        { code: 'do', name: 'Dominican Republic' },
        { code: 'hn', name: 'Honduras' },
        { code: 'ni', name: 'Nicaragua' },
        { code: 'cr', name: 'Costa Rica' },
        { code: 'sv', name: 'El Salvador' },
        { code: 'gt', name: 'Guatemala' },
        { code: 'bz', name: 'Belize' },
        { code: 'pa', name: 'Panama' },
        { code: 'jm', name: 'Jamaica' },
        { code: 'tt', name: 'Trinidad and Tobago' }
    ];

    function findByCode(code) {
        var key = String(code || '').toLowerCase();
        for (var i = 0; i < COUNTRIES.length; i++) {
            if (COUNTRIES[i].code === key) return COUNTRIES[i];
        }
        return null;
    }

    function mount(host, opts) {
        if (!host) return null;
        opts = opts || {};
        var value = String(opts.value || '').toLowerCase();
        var placeholder = opts.placeholder || 'Select country';
        var hidden = opts.hiddenInput || null;
        var storeName = !!opts.storeName;

        host.classList.add('country-picker');
        host.innerHTML =
            '<button type="button" class="country-picker-btn" aria-haspopup="listbox" aria-expanded="false">' +
                '<span class="country-picker-current"></span>' +
                '<i class="fas fa-chevron-down" aria-hidden="true"></i>' +
            '</button>' +
            '<div class="country-picker-menu" hidden>' +
                '<input type="search" class="country-picker-search" placeholder="Search country…" autocomplete="off">' +
                '<div class="country-picker-list" role="listbox"></div>' +
            '</div>';

        var btn = host.querySelector('.country-picker-btn');
        var current = host.querySelector('.country-picker-current');
        var menu = host.querySelector('.country-picker-menu');
        var list = host.querySelector('.country-picker-list');
        var search = host.querySelector('.country-picker-search');

        function paintButton() {
            var country = findByCode(value);
            if (country) {
                current.innerHTML = '<span class="fi fi-' + country.code + '"></span><span>' + country.name + '</span>';
            } else {
                current.innerHTML = '<span class="country-picker-placeholder">' + placeholder + '</span>';
            }
            if (hidden) {
                hidden.value = storeName ? (country ? country.name : '') : (country ? country.code : '');
            }
        }

        function paintList(filter) {
            var q = String(filter || '').trim().toLowerCase();
            var html = '';
            COUNTRIES.forEach(function (country) {
                if (q && country.name.toLowerCase().indexOf(q) === -1 && country.code.indexOf(q) === -1) return;
                html += '<button type="button" class="country-picker-item' + (country.code === value ? ' is-active' : '') + '" data-code="' + country.code + '" role="option">' +
                    '<span class="fi fi-' + country.code + '"></span>' +
                    '<span>' + country.name + '</span>' +
                    '</button>';
            });
            list.innerHTML = html || '<p class="country-picker-empty">No countries found.</p>';
        }

        function open() {
            menu.hidden = false;
            btn.setAttribute('aria-expanded', 'true');
            host.classList.add('is-open');
            paintList(search.value);
            search.focus();
        }

        function close() {
            menu.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
            host.classList.remove('is-open');
        }

        function setValue(code) {
            value = String(code || '').toLowerCase();
            paintButton();
            if (typeof opts.onChange === 'function') opts.onChange(value, findByCode(value));
        }

        btn.addEventListener('click', function (ev) {
            ev.preventDefault();
            if (menu.hidden) open();
            else close();
        });

        search.addEventListener('input', function () {
            paintList(search.value);
        });

        list.addEventListener('click', function (ev) {
            var item = ev.target.closest('.country-picker-item');
            if (!item) return;
            setValue(item.getAttribute('data-code'));
            close();
        });

        document.addEventListener('click', function (ev) {
            if (!host.contains(ev.target)) close();
        });

        paintButton();
        paintList('');

        return {
            getValue: function () { return value; },
            getCountry: function () { return findByCode(value); },
            setValue: setValue
        };
    }

    global.gldCountryPicker = {
        COUNTRIES: COUNTRIES,
        mount: mount
    };
})(window);
