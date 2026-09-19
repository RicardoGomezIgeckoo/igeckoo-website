/* ---------------------------------------------------------------------------
   igeckoo-ext.js — two additions to the recovered page:

     1. EN | ES language switch (top right of both navbars). Default is EN.
     2. EMPRESAS view, opened from the "MX" circle in the menu.

   Translation strategy: the page is walked once on load and every text node is
   recorded together with its ORIGINAL value. Switching to Spanish rewrites each
   node from a string -> string dictionary; switching back restores the recorded
   original verbatim. Nothing is translated at build time, so the shipped HTML
   stays the English page and search engines still see real content.

   Leading and trailing whitespace of each text node is preserved. That matters:
   several paragraphs are split across inline elements ("We are an <b>Oracle Gold
   partner</b> and ..."), and trimming would glue words to their neighbours.

   Strings missing from the dictionary are left untouched by design — product
   names, addresses, phone numbers, e-mail addresses, and the privacy modal,
   which the original site already published in Spanish.
--------------------------------------------------------------------------- */
(function () {
    "use strict";

    var DICT = (window.IGECKOO_ES && window.IGECKOO_ES.text) || {};
    var PLACEHOLDERS = (window.IGECKOO_ES && window.IGECKOO_ES.placeholders) || {};
    var STORAGE_KEY = "igeckoo-lang";
    var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1 };

    var nodes = [];       // {node, raw, key, lead, trail}
    var fields = [];      // {el, raw}
    var attrs = [];       // {el, attr, raw} — title / aria-label
    var mailLinks = [];   // elements carrying data-mailto-en / data-mailto-es
    var current = "en";

    /* Attributes carrying visible or announced text. The menu circles are empty
       <a> elements with a sprite for a background, so for the MX one these two
       are the ONLY place its name exists in the DOM — a tree walker sees no
       text node there at all, and without this the tooltip and the screen
       reader would keep saying "Mexico Business" on a page turned to Spanish.
       Values not in the dictionary are left alone, which is what keeps
       "Toggle navigation" and the switch's own "Language" untouched. */
    var TEXT_ATTRS = ["title", "aria-label"];

    function collect() {
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        var n;
        while ((n = walker.nextNode())) {
            var parent = n.parentElement;
            if (!parent || SKIP_TAGS[parent.tagName]) continue;
            // The language switch labels themselves must never be translated.
            if (parent.closest && parent.closest(".lang-switch")) continue;
            // Mail links carry their own per-language address, swapped below
            // together with the href. Letting the walker touch the label too
            // would leave the visible address and the link disagreeing.
            if (parent.closest && parent.closest("[data-mailto-es]")) continue;
            var raw = n.nodeValue;
            var key = raw.replace(/\s+/g, " ").trim();
            if (!key) continue;
            nodes.push({
                node: n,
                raw: raw,
                key: key,
                lead: (raw.match(/^\s*/) || [""])[0],
                trail: (raw.match(/\s*$/) || [""])[0]
            });
        }
        mailLinks = [].slice.call(document.querySelectorAll("[data-mailto-es]"));

        var withPlaceholder = document.querySelectorAll("[placeholder]");
        for (var i = 0; i < withPlaceholder.length; i++) {
            fields.push({ el: withPlaceholder[i], raw: withPlaceholder[i].getAttribute("placeholder") });
        }

        for (var a = 0; a < TEXT_ATTRS.length; a++) {
            var carrying = document.querySelectorAll("[" + TEXT_ATTRS[a] + "]");
            for (var c = 0; c < carrying.length; c++) {
                attrs.push({
                    el: carrying[c],
                    attr: TEXT_ATTRS[a],
                    raw: carrying[c].getAttribute(TEXT_ATTRS[a])
                });
            }
        }
    }

    /* `persist` is false when the language is applied rather than chosen — on
       first load, from a saved preference. Only a click on the EN|ES switch is
       a real choice worth writing back to storage. (This once mattered for the
       EMPRESAS view too, which forced Spanish on open and would otherwise have
       saved it as the visitor's permanent preference; the module follows the
       switch now and forces nothing.) */
    function apply(lang, persist) {
        var toEs = lang === "es";
        for (var i = 0; i < nodes.length; i++) {
            var it = nodes[i];
            if (toEs) {
                var t = DICT[it.key];
                it.node.nodeValue = t ? it.lead + t + it.trail : it.raw;
            } else {
                it.node.nodeValue = it.raw;
            }
        }
        for (var j = 0; j < fields.length; j++) {
            var f = fields[j];
            var p = toEs ? PLACEHOLDERS[f.raw] : null;
            f.el.setAttribute("placeholder", p || f.raw);
        }
        for (var a = 0; a < attrs.length; a++) {
            var at = attrs[a];
            var v = toEs ? DICT[at.raw] : null;
            at.el.setAttribute(at.attr, v || at.raw);
        }
        // contact@ in English, contacto@ in Spanish — same shared mailbox, but
        // the address shown and the address the link opens must always match.
        for (var m = 0; m < mailLinks.length; m++) {
            var el = mailLinks[m];
            var addr = toEs ? el.getAttribute("data-mailto-es") : el.getAttribute("data-mailto-en");
            if (!addr) continue;
            el.setAttribute("href", "mailto:" + addr);
            el.textContent = addr;
        }

        document.documentElement.setAttribute("lang", toEs ? "es" : "en");
        current = lang;

        var buttons = document.querySelectorAll(".lang-switch button");
        for (var k = 0; k < buttons.length; k++) {
            var isActive = buttons[k].getAttribute("data-lang") === lang;
            buttons[k].classList.toggle("is-active", isActive);
            buttons[k].setAttribute("aria-pressed", isActive ? "true" : "false");
        }
        if (persist) {
            try {
                localStorage.setItem(STORAGE_KEY, lang);
            } catch (e) {
                /* private mode / storage disabled — the switch still works for this visit */
            }
        }
    }

    /* --- EMPRESAS view ---------------------------------------------------
       The module used to be Spanish-only, so opening it forced ES and closing
       it restored whatever the visitor had been reading. That was jarring: an
       English reader clicked one menu entry and the entire site changed
       language under them, then changed back on the way out.

       The module is written in English now, like every other section, and
       translated by the same dictionary — so it simply inherits whatever
       language is active. Nothing here touches the language at all. */
    function openEmpresas() {
        if (document.body.classList.contains("view-empresas")) return;
        document.body.classList.add("view-empresas");
        window.scrollTo(0, 0);
    }

    /* The menu entries for the module's own sections (#emp-...) have to open
       the view *and* scroll to the section, in that order — the target is
       display:none until the view opens, so measuring it first gives 0.

       The site's own scrolling comes from app.js:

           $(".menu-link").click(function(){ ... animate({scrollTop:
               $($(this).attr("href")).offset().top - 60}, 900) })

       which is why these links deliberately do NOT carry .menu-link: that
       handler is bound directly to the element and runs before this one, so it
       would measure the section while it is still hidden and scroll to 0. Same
       900ms, same 60px allowance for the fixed header, done at the right
       moment instead. */
    function scrollToSection(hash) {
        var el = null;
        try {
            el = document.querySelector(hash);
        } catch (e) {
            return;                      // not a usable selector — ignore
        }
        if (!el) return;
        var top = el.getBoundingClientRect().top + (window.pageYOffset || 0) - 60;
        window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
    }

    /* On a phone the burger menu is an overlay. Every other entry scrolls the
       page underneath it, so leaving it open is harmless; EMPRESAS replaces the
       whole page, and an open menu would cover the view it just opened. */
    function closeBurger() {
        var panel = document.getElementById("navbar-mobile");
        if (panel) panel.classList.remove("show");
    }

    function closeEmpresas() {
        if (!document.body.classList.contains("view-empresas")) return;
        document.body.classList.remove("view-empresas");
    }

    function wire() {
        document.addEventListener("click", function (ev) {
            var target = ev.target;

            var langBtn = target.closest && target.closest(".lang-switch button");
            if (langBtn) {
                ev.preventDefault();
                apply(langBtn.getAttribute("data-lang"), true);
                return;
            }

            var empresas = target.closest && target.closest(".js-empresas");
            if (empresas) {
                ev.preventDefault();
                var to = empresas.getAttribute("href") || "";
                openEmpresas();
                closeBurger();
                if (to.charAt(0) === "#" && to !== "#empresas") scrollToSection(to);
                return;
            }

            // Any other in-page link returns to the main site before jumping.
            var link = target.closest && target.closest("a[href]");
            if (link && document.body.classList.contains("view-empresas")) {
                var href = link.getAttribute("href") || "";
                if (href.charAt(0) === "#" && href.length > 1) {
                    closeEmpresas();
                } else if (link.classList.contains("navbar-brand")) {
                    closeEmpresas();
                }
            }
        });
    }

    function init() {
        collect();
        wire();
        var saved = null;
        try {
            saved = localStorage.getItem(STORAGE_KEY);
        } catch (e) { /* ignore */ }
        apply(saved === "es" ? "es" : "en", false);   // default EN
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
