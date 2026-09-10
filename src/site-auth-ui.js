(function (global) {
    var KEY = 'gldSiteJwt';

    function getToken() {
        try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
    }

    function setToken(token) {
        try {
            if (token) localStorage.setItem(KEY, token);
            else localStorage.removeItem(KEY);
        } catch (e) {}
    }

    function logout() {
        setToken('');
        location.reload();
    }

    function authHeaders() {
        var token = getToken();
        return token ? { Authorization: 'Bearer ' + token } : {};
    }

    async function fetchMe() {
        var token = getToken();
        if (!token) return null;
        try {
            var res = await fetch('/api/site/me', { headers: authHeaders() });
            var data = await res.json();
            if (!res.ok || !data.success) {
                setToken('');
                return null;
            }
            return data.user;
        } catch (e) {
            return null;
        }
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function mountBar() {
        if (document.body.classList.contains('account-page')) return;
        if (document.getElementById('site-auth-bar')) return;
        var bar = document.createElement('div');
        bar.id = 'site-auth-bar';
        bar.className = 'site-auth-bar';
        var next = encodeURIComponent((location.pathname || '/') + (location.search || '') + (location.hash || ''));
        bar.innerHTML = '<a class="site-auth-login" href="/account?next=' + next + '">Log in</a>';
        document.body.insertBefore(bar, document.body.firstChild);
        fetchMe().then(function (user) {
            if (!user) return;
            bar.innerHTML =
                '<div class="site-auth-user' + (user.isAdmin ? ' is-admin' : '') + '">' +
                    (user.isAdmin ? '<span class="site-auth-admin-badge">Admin</span>' : '') +
                    '<span class="site-auth-name">' + escapeHtml(user.displayName || user.username) + '</span>' +
                    '<button type="button" class="site-auth-logout" id="site-auth-logout">Log out</button>' +
                '</div>';
            var btn = document.getElementById('site-auth-logout');
            if (btn) btn.addEventListener('click', logout);
        });
    }

    global.gldSiteAuth = {
        KEY: KEY,
        getToken: getToken,
        setToken: setToken,
        logout: logout,
        authHeaders: authHeaders,
        fetchMe: fetchMe,
        mountBar: mountBar
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountBar);
    } else {
        mountBar();
    }
})(window);
