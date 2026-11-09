/* Bailleul Super Bon Plan — application (JavaScript sans framework, empaquetée avec Capacitor) */
(function () {
  'use strict';

  var API_URL = (window.BSBP_CONFIG && window.BSBP_CONFIG.API_URL || '').trim();
  var MODE_DEMO = !API_URL;
  var VERSION_APP = '6.4.0';
  var Cap = window.Capacitor;
  var Plugins = (Cap && Cap.Plugins) || {};
  var NATIF = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  var MOUVEMENT_REDUIT = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var etat = {
    config: null, articles: null, jeton: '', utilisateur: null,
    categorie: '', sousCategorie: '', tailles: [], largeurMax: null, pourMoi: false, panneauTailles: false,
    recherche: '', filtre: null, pile: [], onglet: 'catalogue', nonLus: 0, poll: null,
    apresConnexion: null, equipeVue: 'retraits', brouillon: { photos: [] }, brouillonDon: { photos: [] },
    favoris: [], alertes: [], mesAttentes: []
  };
  var $vue = document.getElementById('vue');

  // ================= Stockage local =================
  var stockage = {
    get: function (k) {
      if (Plugins.Preferences) return Plugins.Preferences.get({ key: k }).then(function (r) { return r.value; });
      try { return Promise.resolve(localStorage.getItem(k)); } catch (e) { return Promise.resolve(null); }
    },
    set: function (k, v) {
      if (Plugins.Preferences) return v == null ? Plugins.Preferences.remove({ key: k }) : Plugins.Preferences.set({ key: k, value: v });
      try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {}
      return Promise.resolve();
    }
  };

  // ================= API =================
  // Lectures : on peut réessayer sans risque. Écritures : seulement si le moteur était occupé (rien n'a été enregistré).
  var LECTURES = ['mesResas', 'equipeTableau', 'equipePoints', 'demarrage', 'config', 'articles', 'article', 'materiel', 'outil', 'mesLocations', 'equipeLocations', 'equipeMateriel', 'photo', 'moi', 'mesReservations', 'mesAlertes', 'mesDons', 'monBilan',
    'mesConversations', 'lireConversation', 'equipeReservations', 'equipeArticles', 'equipeDons', 'equipeAnimations', 'equipeConversations',
    'equipeLireConversation', 'equipeReglages'];
  function attendre(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function api(action, donnees, essai) {
    essai = essai || 0;
    var lecture = LECTURES.indexOf(action) >= 0;
    var corps = Object.assign({ action: action, jeton: etat.jeton }, donnees || {});
    var appel = MODE_DEMO
      ? window.BSBP_DEMO(corps)
      : fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(corps), redirect: 'follow' })
          .then(function (r) { if (!r.ok) throw new Error('reseau'); return r.json(); });
    return appel.then(function (rep) { return rep; }, function () {
      if (lecture && essai < 2) return attendre(1200 * (essai + 1)).then(function () { return { relance: true }; });
      throw erreurUtilisateur('Connexion impossible. Vérifiez votre accès à Internet.');
    }).then(function (rep) {
      if (rep.relance) return api(action, donnees, essai + 1);
      if (rep.ok) return rep.data;
      if (rep.code === 'OCCUPE' && essai < 2) return attendre(1500 * (essai + 1)).then(function () { return api(action, donnees, essai + 1); });
      if (rep.code === 'AUTH') deconnecterLocalement();
      throw erreurUtilisateur(rep.error || 'Une erreur est survenue.');
    });
  }

  /**
   * Affichage immédiat avec la dernière réponse connue, puis mise à jour dès que le moteur répond.
   * Le rendu n'est refait que si les données ont changé.
   */
  var memoire = {};
  function avecMemoire(action, donnees) {
    var cle = action + JSON.stringify(donnees || {});
    var cb = null, cbErr = null, dejaRendu = null, vid = etat.vueId;
    var enCache = memoire[cle];
    var o = {
      then: function (f) {
        cb = f;
        if (enCache) { dejaRendu = JSON.stringify(enCache); setTimeout(function () { if (etat.vueId === vid) f(enCache); }, 0); }
        return o;
      },
      catch: function (f) { cbErr = f; return o; }
    };
    api(action, donnees).then(function (d) {
      memoire[cle] = d;
      if (action === 'mesResas') stockage.set('memo_resa', JSON.stringify(d));
      if (action === 'equipeTableau') stockage.set('memo_tableau', JSON.stringify(d));
      if (cb && etat.vueId === vid && JSON.stringify(d) !== dejaRendu) cb(d);
    }).catch(function (e) { if (!enCache && cbErr && etat.vueId === vid) cbErr(e); });
    return o;
  }
  /** Met à jour tout de suite la liste gardée en mémoire (Mes résas, Messages), sans attendre le moteur. */
  function majMemoire(cle, f) { var m = memoire[cle]; if (!m) return; try { f(m); stockage.set('memo_resa', JSON.stringify(memoire['mesResas{}'] || {})); } catch (e) { delete memoire[cle]; } }
  function precharger() {
    if (!etat.jeton) return;
    ['mesResas', 'mesConversations'].concat(etat.utilisateur && etat.utilisateur.role ? ['equipeReservations', 'equipeConversations'] : [])
      .forEach(function (a) { api(a).then(function (d) { memoire[a + '{}'] = d; }).catch(function () {}); });
  }
  function erreurUtilisateur(m) { var e = new Error(m); e.utilisateur = true; return e; }

  // ================= Outils =================
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function prix(n) { n = Number(n) || 0; return (n % 1 ? n.toFixed(2).replace('.', ',') : String(n)) + ' €'; }
  function co2(n) { n = Number(n) || 0; return (n >= 100 ? Math.round(n).toLocaleString('fr-FR') : String(Math.round(n * 10) / 10).replace('.', ',')) + ' kg CO₂e'; }
  function kg(n) { n = Number(n) || 0; return (n >= 10 ? Math.round(n).toLocaleString('fr-FR') : String(Math.round(n * 10) / 10).replace('.', ',')) + ' kg'; }
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function dateLongue(ms) { var d = new Date(ms); return JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()]; }
  function heure(ms) { var d = new Date(ms); return d.getHours() + 'h' + String(d.getMinutes()).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function joursRestants(ms) { var a = new Date(); a.setHours(0, 0, 0, 0); var b = new Date(ms); b.setHours(0, 0, 0, 0); return Math.round((b - a) / 86400000); }
  function sansAccents(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe'); }
  function cfg() { return etat.config || { categories: [], point: {}, creneaux: [], joursOuverture: [], etiquettes: [], dons: {}, animation: { theme: 'classique', bandeaux: [] }, impact: {} }; }

  var ICONES = {
    retour: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    loupe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    coeur: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-9.2-9.3C1.6 7.3 3.8 4 7.2 4c2 0 3.4 1.1 4.8 2.8C13.4 5.1 14.8 4 16.8 4c3.4 0 5.6 3.3 4.4 6.7C19.5 15.4 12 20 12 20z"/></svg>',
    cloche: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0"/></svg>',
    partage: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7.5 7.5 12 3l4.5 4.5M5 12v8h14v-8"/></svg>',
    etoile: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    outil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.1-.6-.6-2.1z"/></svg>',
    calendrier: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    reglages: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    trombone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    bulle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    telephone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .9a5 5 0 0 1-2.8-2.8l.9-1-1-2z"/></svg>',
    enveloppe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6h17v12h-17zM3.5 6.5l8.5 7 8.5-7"/></svg>',
    monde: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
    feuille: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15M5 19l7-7"/></svg>'
  };

  // Photos : vignette Drive publique, sinon récupération par l'API (si le partage public est bloqué).
  var cachePhotos = {};
  /** « −20 % sur tout », « sur la location », « sur les Vêtements »… */
  function libelleRemise(sur) {
    var s0 = sansAccents(sur || 'Tout');
    if (s0 === 'tout' || s0 === '') return 'sur tout';
    if (s0 === 'location') return 'sur la location';
    if (s0 === 'a la une') return 'sur la sélection « À la une »';
    var cats = cfg().categories || [];
    return cats.indexOf(sur) >= 0 ? 'sur les ' + sur.toLowerCase() : 'sur « ' + sur + ' »';
  }
  function urlPhoto(ref, largeur) {
    if (!ref) return '';
    if (/^(https?:|data:)/.test(ref)) return ref;
    var l = Math.min(1600, Math.round((largeur || 800) * Math.min(2, window.devicePixelRatio || 1) / 2));
    return 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(ref) + '=w' + Math.max(200, l);
  }
  function imgPhoto(ref, alt, largeur) {
    if (!ref) return '<div class="sans-photo">Pas de photo</div>';
    var src = cachePhotos[ref] || urlPhoto(ref, largeur);
    return '<img src="' + esc(src) + '" alt="' + esc(alt || '') + '" loading="lazy" data-ref="' + esc(ref) + '">';
  }
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (img.tagName !== 'IMG' || !img.dataset.ref || img.dataset.secours) return;
    var ref = img.dataset.ref;
    if (/^(https?:|data:)/.test(ref)) return;
    if (!img.dataset.essai2) { img.dataset.essai2 = '1'; img.src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(ref) + '&sz=w800'; return; }
    img.dataset.secours = '1';
    api('photo', { id: ref }).then(function (data) { cachePhotos[ref] = data; img.src = data; }).catch(function () {});
  }, true);

  function toast(msg, erreur) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = erreur ? 'erreur' : ''; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, erreur ? 4500 : 2800);
  }
  function erreur(e) { toast(e && e.utilisateur ? e.message : 'Une erreur est survenue.', true); if (!(e && e.utilisateur)) console.error(e); }

  function modale(titre, texte, boutons, champ) {
    return new Promise(function (resoudre) {
      var m = document.getElementById('modale');
      m.innerHTML = '<div class="feuille" role="dialog" aria-modal="true" aria-labelledby="m-titre"><h2 id="m-titre">' + esc(titre) + '</h2>' +
        (texte ? '<p>' + texte + '</p>' : '') +
        (champ ? '<label class="champ" style="margin-bottom:16px">' + esc(champ.label) + '<textarea id="m-champ" placeholder="' + esc(champ.placeholder || '') + '"></textarea></label>' : '') +
        '<div class="pile">' + boutons.map(function (b, i) { return '<button class="bouton ' + (b.style || '') + '" data-i="' + i + '">' + esc(b.texte) + '</button>'; }).join('') + '</div></div>';
      m.hidden = false;
      (m.querySelector('textarea') || m.querySelector('button')).focus();
      m.onclick = function (e) {
        var b = e.target.closest('button[data-i]');
        if (!b && e.target !== m) return;
        var txt = champ ? document.getElementById('m-champ').value : null;
        m.hidden = true; m.innerHTML = '';
        var v = b ? boutons[Number(b.dataset.i)].valeur : null;
        resoudre(champ && v ? { valeur: v, texte: txt } : v);
      };
    });
  }

  function chargement(btn, actif, texte) {
    if (!btn) return;
    if (actif) { btn.dataset.texte = btn.innerHTML; btn.textContent = texte || 'Un instant…'; btn.disabled = true; }
    else { btn.innerHTML = btn.dataset.texte || btn.innerHTML; btn.disabled = false; }
  }
  function boutonRetour() { return '<button class="retour" data-retour>' + ICONES.retour + 'Retour</button>'; }
  function revenir() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    etat.pile.length > 1 ? retour() : ouvrirOnglet(etat.onglet);
  }
  $vue.addEventListener('click', function (e) { if (e.target.closest('[data-retour]')) revenir(); });
  // Geste iPhone : glisser depuis le bord gauche de l'écran pour revenir en arrière.
  var glisse = null;
  document.addEventListener('touchstart', function (e) { var t = e.touches[0]; glisse = t.clientX < 24 && etat.pile.length > 1 ? { x: t.clientX, y: t.clientY } : null; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (!glisse) return;
    var t = e.changedTouches[0];
    if (t.clientX - glisse.x > 80 && Math.abs(t.clientY - glisse.y) < 60 && document.getElementById('modale').hidden) revenir();
    glisse = null;
  }, { passive: true });
  function ouvrirImage(src) {
    var m = document.getElementById('modale');
    m.innerHTML = '<div class="visionneuse"><img src="' + src + '" alt=""><button class="bouton second" data-i="0">Fermer</button></div>';
    m.hidden = false;
    m.onclick = function () { m.hidden = true; m.innerHTML = ''; };
  }

  // ================= Navigation =================
  var vues = {};
  function aller(nom, params, remplacer) {
    if (remplacer) etat.pile.pop();
    etat.pile.push({ nom: nom, params: params || {} });
    afficher();
  }
  function retour() { if (etat.pile.length > 1) { etat.pile.pop(); afficher(); } }
  function ouvrirOnglet(nom) { etat.onglet = nom; etat.pile = [{ nom: nom, params: {} }]; afficher(); }
  /** Compte équipe : l'app n'affiche que l'espace équipe (sauf si le salarié choisit « Voir l'app comme un client »). */
  function modeEquipe() { return !!(etat.utilisateur && etat.utilisateur.role && !etat.modeClient); }
  function accueil() { return modeEquipe() ? 'eq-accueil' : 'catalogue'; }
  var ONGLETS_EQUIPE = { 'eq-accueil': 'accueil', 'eq-retraits': 'retraits', 'eq-locations': 'locations', 'eq-messages': 'messages', 'eq-stock': 'stock', 'eq-plus': 'plus' };
  Object.keys(ONGLETS_EQUIPE).forEach(function (k) { vues[k] = function () { etat.equipeVue = ONGLETS_EQUIPE[k]; vues.equipe(); }; });
  function afficher() {
    arreterParticules();
    if (etat.poll) { clearInterval(etat.poll); clearTimeout(etat.poll); etat.poll = null; }
    etat.relancerConv = null;
    etat.vueId = (etat.vueId || 0) + 1; // les réponses qui arrivent après un changement d'écran sont ignorées
    $vue.onclick = null;
    var courant = etat.pile[etat.pile.length - 1];
    if (courant.nom !== 'retour') etat.ecran = courant.nom;
    document.querySelectorAll('#onglets button').forEach(function (b) {
      if (b.dataset.onglet === etat.onglet) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    var eq = modeEquipe(), loc = !!(cfg().location && cfg().location.active);
    document.querySelectorAll('#onglets button').forEach(function (b) {
      var o = b.dataset.onglet, estEq = o.indexOf('eq-') === 0;
      b.hidden = eq ? !estEq || (o === 'eq-locations' && !loc) : estEq || o === 'equipe' || (o === 'louer' && !loc);
    });
    var rv = document.getElementById('retour-equipe');
    if (rv) rv.hidden = !(etat.utilisateur && etat.utilisateur.role && etat.modeClient);
    majPastille();
    window.scrollTo(0, 0);
    vues[courant.nom](courant.params);
  }
  document.getElementById('retour-equipe').addEventListener('click', function () { etat.modeClient = false; ouvrirOnglet('eq-accueil'); });
  document.getElementById('onglets').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (b) ouvrirOnglet(b.dataset.onglet);
  });
  if (Plugins.App) Plugins.App.addListener('backButton', function () { if (etat.pile.length > 1) retour(); else Plugins.App.exitApp(); });
  function majPastille() {
    var bm = document.querySelector('[data-onglet="messages"]');
    if (bm) bm.classList.toggle('pastille', etat.nonLus > 0);
    var be = document.querySelector('[data-onglet="eq-messages"]');
    if (be) be.classList.toggle('pastille', (etat.nonLusEquipe || 0) > 0);
    var b = document.querySelector('[data-onglet="reservations"]');
    var n = etat.mesAttentes.filter(function (w) { return w.statut === 'proposé'; }).length;
    b.classList.toggle('pastille', n > 0);
  }
  function exigerConnexion(raison, suite) {
    if (etat.jeton) return true;
    etat.apresConnexion = suite;
    aller('connexion', { raison: raison });
    return false;
  }

  // ================= Thème et animations saisonnières =================
  var THEMES = {
    'classique': { particules: '' },
    'noel': { particules: 'neige' }, 'hiver': { particules: 'neige' }, 'saint-valentin': { particules: 'coeurs' },
    'carnaval': { particules: 'confettis' }, 'printemps': { particules: 'petales' }, 'fete-des-meres': { particules: 'petales' },
    'ete': { particules: 'bulles' }, 'rentree': { particules: 'etincelles' }, 'automne': { particules: 'feuilles' },
    'halloween': { particules: 'feuilles' }, 'bonnes-affaires': { particules: 'etincelles' }
  };
  function appliquerTheme(theme) {
    document.documentElement.dataset.theme = THEMES[theme] ? theme : 'classique';
  }

  var animations = [];
  function arreterParticules() { animations.forEach(function (a) { a.stop = true; }); animations = []; }
  function lancerParticules(canvas, type) {
    if (!type || !canvas) return;
    var ctx = canvas.getContext('2d');
    var ratio = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * ratio; canvas.height = h * ratio; ctx.scale(ratio, ratio);
    var couleurs = {
      neige: ['#FFFFFF'], coeurs: ['#FFD1E0', '#FF8FB1', '#FFFFFF'], confettis: ['#FFD23F', '#FF6B6B', '#4ECDC4', '#FFFFFF', '#A78BFA'],
      petales: ['#FFC4D6', '#FFE3EC', '#FFFFFF'], bulles: ['rgba(255,255,255,.55)'], etincelles: ['#FFD23F', '#FFFFFF'],
      feuilles: ['#F2B45A', '#E07A3F', '#C2502A', '#FFD23F']
    }[type] || ['#fff'];
    var n = type === 'confettis' ? 34 : type === 'etincelles' ? 18 : 26;
    var parts = [];
    for (var i = 0; i < n; i++) parts.push(nouvelle(true));
    function nouvelle(partout) {
      var monte = type === 'bulles';
      return {
        x: Math.random() * w, y: partout ? Math.random() * h : (monte ? h + 10 : -10),
        r: type === 'neige' ? 1.2 + Math.random() * 2.6 : 3 + Math.random() * 4,
        vy: (monte ? -1 : 1) * (0.25 + Math.random() * 0.6), vx: (Math.random() - 0.5) * 0.4,
        a: Math.random() * Math.PI * 2, va: (Math.random() - 0.5) * 0.06, t: Math.random() * 100,
        c: couleurs[Math.floor(Math.random() * couleurs.length)]
      };
    }
    function dessiner(p) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.strokeStyle = p.c;
      if (type === 'neige') { ctx.globalAlpha = .85; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, 7); ctx.fill(); }
      else if (type === 'coeurs') { var s = p.r / 4; ctx.globalAlpha = .9; ctx.beginPath(); ctx.moveTo(0, 3 * s); ctx.bezierCurveTo(-6 * s, -1 * s, -3 * s, -6 * s, 0, -2.5 * s); ctx.bezierCurveTo(3 * s, -6 * s, 6 * s, -1 * s, 0, 3 * s); ctx.fill(); }
      else if (type === 'confettis') { ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); }
      else if (type === 'petales' || type === 'feuilles') { ctx.globalAlpha = .9; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r / 2.2, 0, 0, 7); ctx.fill(); }
      else if (type === 'bulles') { ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, 7); ctx.stroke(); }
      else if (type === 'etincelles') { var al = .4 + .6 * Math.abs(Math.sin(p.t / 20)); ctx.globalAlpha = al; var r = p.r * .8; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * .25, -r * .25); ctx.lineTo(r, 0); ctx.lineTo(r * .25, r * .25); ctx.lineTo(0, r); ctx.lineTo(-r * .25, r * .25); ctx.lineTo(-r, 0); ctx.lineTo(-r * .25, -r * .25); ctx.fill(); }
      ctx.restore();
    }
    var anim = { stop: false };
    animations.push(anim);
    function image() {
      if (anim.stop || !canvas.isConnected) return;
      ctx.clearRect(0, 0, w, h);
      parts.forEach(function (p, i) {
        if (type !== 'etincelles') { p.y += p.vy; p.x += p.vx + Math.sin((p.t + p.y) / 30) * 0.3; p.a += p.va; }
        p.t++;
        if (p.y > h + 12 || p.y < -14) parts[i] = nouvelle(false);
        dessiner(p);
      });
      requestAnimationFrame(image);
    }
    if (MOUVEMENT_REDUIT) { ctx.clearRect(0, 0, w, h); parts.forEach(dessiner); } else image();
  }

  function htmlBandeaux(bandeaux) {
    if (!bandeaux || !bandeaux.length) return '';
    return '<section class="bandeaux" aria-label="À la une en ce moment"><div class="defile">' + bandeaux.map(function (b, i) {
      var fond = b.image ? (/^data:/.test(b.image) ? b.image : urlPhoto(b.image, 1200)) : '';
      return '<div class="bandeau' + (fond ? ' avec-image' : '') + '" data-theme-b="' + esc(b.theme) + '">' +
        (fond ? '<img class="bandeau-fond" src="' + esc(fond) + '" alt="">' : '<canvas aria-hidden="true" data-particules="' + esc((THEMES[b.theme] || {}).particules || '') + '"></canvas>') +
        (b.remise ? '<span class="bandeau-remise">−' + esc(b.remise) + ' %<small>' + esc(libelleRemise(b.remiseSur)) + '</small></span>' : '') +
        '<div class="bandeau-texte"><h2>' + esc(b.titre) + '</h2>' + (b.texte ? '<p>' + esc(b.texte) + '</p>' : '') +
        (b.bouton && b.lien ? '<button class="bouton-bandeau" data-bandeau="' + i + '">' + esc(b.bouton) + '</button>' : '') + '</div>' +
        '</div>';
    }).join('') + '</div>' +
      (bandeaux.length > 1 ? '<div class="points">' + bandeaux.map(function (_, i) { return '<i' + (i ? '' : ' class="actif"') + '></i>'; }).join('') + '</div>' : '') + '</section>';
  }
  function activerBandeaux(zone, bandeaux) {
    var sec = zone.querySelector('.bandeaux'); if (!sec) return;
    sec.querySelectorAll('canvas').forEach(function (c) { lancerParticules(c, c.dataset.particules); });
    var defile = sec.querySelector('.defile');
    defile.addEventListener('scroll', function () {
      var i = Math.round(defile.scrollLeft / defile.clientWidth);
      sec.querySelectorAll('.points i').forEach(function (pt, j) { pt.className = i === j ? 'actif' : ''; });
    }, { passive: true });
    sec.onclick = function (e) {
      var b = e.target.closest('[data-bandeau]'); if (!b) return;
      var lien = bandeaux[Number(b.dataset.bandeau)].lien || {};
      etat.categorie = ''; etat.recherche = ''; etat.filtre = null;
      if (lien.type === 'categorie') etat.categorie = lien.valeur;
      else if (lien.type === 'recherche') etat.recherche = lien.valeur;
      else if (lien.type === 'une') etat.filtre = { type: 'une', libelle: 'À la une' };
      else if (lien.type === 'etiquette') etat.filtre = { type: 'etiquette', valeur: lien.valeur, libelle: lien.valeur };
      vues.catalogue();
      var l = document.getElementById('liste'); if (l) l.scrollIntoView({ behavior: MOUVEMENT_REDUIT ? 'auto' : 'smooth' });
    };
  }

  // ================= Favoris (gardés sur le téléphone) =================
  function estFavori(id) { return etat.favoris.indexOf(id) >= 0; }
  var minuteurFavoris = null;
  function synchroniserFavoris() {
    if (!etat.jeton) return;
    clearTimeout(minuteurFavoris);
    minuteurFavoris = setTimeout(function () { api('syncFavoris', { ids: etat.favoris.slice(0, 200) }).catch(function () {}); }, 1500);
  }
  /** À la connexion : on réunit les favoris du téléphone et ceux du compte. */
  function fusionnerFavoris(duCompte) {
    if (!duCompte) return;
    var avant = etat.favoris.length, union = etat.favoris.slice();
    duCompte.forEach(function (id) { if (union.indexOf(id) < 0) union.push(id); });
    etat.favoris = union.slice(0, 200);
    stockage.set('favoris', JSON.stringify(etat.favoris));
    if (union.length !== duCompte.length || avant !== union.length) synchroniserFavoris();
  }
  function basculerFavori(id) {
    if (estFavori(id)) etat.favoris = etat.favoris.filter(function (x) { return x !== id; });
    else { etat.favoris.unshift(id); toast('Ajouté à vos favoris.'); }
    stockage.set('favoris', JSON.stringify(etat.favoris.slice(0, 200)));
    synchroniserFavoris();
    document.querySelectorAll('[data-fav="' + id + '"]').forEach(function (b) { b.setAttribute('aria-pressed', String(estFavori(id))); });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-fav]'); if (!b) return;
    e.stopPropagation(); basculerFavori(b.dataset.fav);
  }, true);

  // ================= Alertes : correspondance (même règle que le serveur) =================
  function correspond(al, art) {
    if (al.categorie && al.categorie !== art.categorie) return false;
    if (al.sousCategorie && al.sousCategorie !== art.sousCategorie) return false;
    var avecProches = al.proches !== false;
    if (al.prixMax != null && art.prix > al.prixMax) return false;
    var texte = sansAccents([art.titre, art.description, art.taille, art.categorie, art.etat, art.etiquette, art.rech].join(' '));
    if (al.taille) {
      var tailleArt = ' ' + sansAccents(art.taille).replace(/[^a-z0-9]+/g, ' ') + ' ';
      if (tailleArt.indexOf(' ' + sansAccents(al.taille) + ' ') < 0) return false;
    }
    return motsRecherche(al.motsCles).every(function (m) {
      return (avecProches ? variantes(m) : [m]).some(function (v) { return texte.indexOf(racine(v)) >= 0; });
    });
  }
  function resumeAlerte(al) {
    return [al.motsCles ? '« ' + al.motsCles + ' »' + (al.proches ? ' et proches' : '') : '', al.categorie ? al.categorie + (al.sousCategorie ? ' › ' + al.sousCategorie : '') : '', al.taille ? 'taille ' + al.taille : '', al.prixMax != null ? 'jusqu\'à ' + prix(al.prixMax) : '']
      .filter(Boolean).join(', ');
  }

  // ================= Sous-catégories, tailles, caractéristiques =================
  function ref() { return cfg().referentiel || { sousCategories: [], grilles: {} }; }
  function sousCats(cat) { return ref().sousCategories.filter(function (s) { return s.categorie === cat; }); }
  function grilleDe(cat, sc) { var x = ref().sousCategories.filter(function (s) { return s.categorie === cat && s.nom === sc; })[0]; return x && x.grille ? x.grille : ''; }
  function grillesActives() {
    var noms = {};
    ref().sousCategories.forEach(function (s) {
      if (!s.grille) return;
      if (etat.categorie && s.categorie !== etat.categorie) return;
      if (etat.sousCategorie && s.nom !== etat.sousCategorie) return;
      noms[s.grille] = 1;
    });
    return Object.keys(noms);
  }
  function normTaille(t) { return sansAccents(t).replace(/\s+/g, ' ').trim(); }
  function tailleDans(a, liste) { var t = normTaille(a.taille); return liste.some(function (x) { return normTaille(x) === t; }); }
  function libelleLargeur(v) { return 'moins de ' + v + ' cm'; }
  function filtresTaillesActifs() { return etat.tailles.length || etat.largeurMax || etat.pourMoi; }
  function passeTailles(a) {
    if (etat.pourMoi && !tailleDans(a, (etat.utilisateur && etat.utilisateur.tailles) || [])) return false;
    if (etat.tailles.length && !tailleDans(a, etat.tailles)) return false;
    var larg = (a.specs && a.specs.largeur) || a.largeur;
    if (etat.largeurMax && !(larg && larg < etat.largeurMax)) return false;
    return true;
  }
  function htmlSpecs(a) {
    var sp = a.specs || {}, lignes = [];
    if (sp.marque) lignes.push(['Marque', sp.marque]);
    if (sp.matiere) lignes.push(['Matière', sp.matiere]);
    var dims = [sp.largeur && 'L ' + sp.largeur, sp.profondeur && 'P ' + sp.profondeur, sp.hauteur && 'H ' + sp.hauteur].filter(Boolean);
    if (dims.length) lignes.push(['Dimensions', dims.join(' × ') + ' cm']);
    if (sp.teste) lignes.push(['Fonctionnement', 'Testé par l\'équipe, fonctionne']);
    if (!lignes.length && !a.caracteristiques) return '';
    return '<section class="caracteristiques"><h3>Caractéristiques</h3>' +
      (lignes.length ? '<dl>' + lignes.map(function (l) { return '<div><dt>' + esc(l[0]) + '</dt><dd>' + esc(l[1]) + '</dd></div>'; }).join('') + '</dl>' : '') +
      (a.caracteristiques ? '<p>' + esc(a.caracteristiques) + '</p>' : '') + '</section>';
  }

  // ================= Catalogue =================
  var recherchesNotees = {}, minuteurRecherche = null;
  function noterRecherche(q, nb, ou) {
    clearTimeout(minuteurRecherche);
    var t = sansAccents(q || '').trim();
    if (t.length < 3 || MODE_DEMO) return;
    minuteurRecherche = setTimeout(function () {
      if (recherchesNotees[ou + t]) return;
      recherchesNotees[ou + t] = 1;
      api('logRecherche', { texte: t, nb: nb, ou: ou }).catch(function () {});
    }, 2500);
  }
  // ----- Recherche par familles de mots (mêmes règles que les alertes côté moteur) -----
  var MOTS_VIDES = ['de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'pour', 'en', 'a', 'et', 'au', 'aux', 'avec', 'sans', 'd', 'l'];
  function racine(m) { return m.length > 4 ? m.replace(/(s|x)$/, '') : m; }
  function motsRecherche(t) { return sansAccents(t || '').split(/[^a-z0-9-]+/).filter(function (m) { return m.length > 1 && MOTS_VIDES.indexOf(m) < 0; }); }
  function variantes(m) {
    var r = racine(m), out = [m];
    (cfg().familles || []).forEach(function (f) {
      if (f.some(function (x) { return racine(x) === r || x.split(' ').some(function (y) { return racine(y) === r; }); })) out = out.concat(f);
    });
    return out;
  }

  function htmlPrix(p0, initial, suffixe, grand) {
    var solde = initial && initial > p0;
    return '<span class="prix' + (grand ? ' grand' : '') + (solde ? ' solde' : '') + '">' + (solde ? '<s>' + prix(initial) + '</s> ' : '') + prix(p0) + (suffixe ? '<small>' + suffixe + '</small>' : '') + '</span>' +
      (solde ? '<span class="badge-remise' + (grand ? ' grand' : '') + '">−' + Math.round((1 - p0 / initial) * 100) + ' %</span>' : '');
  }
  var fichesEnCours = {};
  function prechargerFiche(id) {
    var a = trouverArticle(id);
    if (!a || !a.leger || fichesEnCours[id]) return;
    fichesEnCours[id] = api('article', { id: id });
    fichesEnCours[id].catch(function () { delete fichesEnCours[id]; });
  }
  function carte(a) {
    return '<div class="carte' + (a.disponible ? '' : ' indispo') + '" data-id="' + esc(a.id) + '" role="link" tabindex="0" aria-label="' + esc(a.titre + ', ' + prix(a.prix)) + '">' +
      '<div class="photo">' + imgPhoto(a.photos[0], '', 600) +
      (a.etiquette ? '<span class="etiq">' + esc(a.etiquette) + '</span>' : '') +
      (a.disponible ? '' : '<span class="voile">Réservé</span>') +
      '<button class="fav" data-fav="' + esc(a.id) + '" aria-pressed="' + estFavori(a.id) + '" aria-label="Favori">' + ICONES.coeur + '</button>' +
      htmlPrix(a.prix, a.prixInitial) + '</div><h3>' + esc(a.titre) + '</h3><p>' + esc([a.taille, a.etat].filter(Boolean).join(', ') || a.categorie || '') + '</p></div>';
  }
  function brancherCartes(zone) {
    zone.addEventListener('click', function (e) { var c = e.target.closest('.carte'); if (c && !e.target.closest('[data-fav]')) aller('article', { id: c.dataset.id }); });
    zone.addEventListener('pointerdown', function (e) { var c = e.target.closest('.carte'); if (c) prechargerFiche(c.dataset.id); }, { passive: true });
    zone.addEventListener('keydown', function (e) { var c = e.target.closest('.carte'); if (c && e.key === 'Enter') aller('article', { id: c.dataset.id }); });
  }
  function rangee(titre, articles, id) {
    if (!articles.length) return '';
    return '<section class="rangee-h" id="' + id + '"><h2 class="section">' + titre + '</h2><div class="defile-h">' + articles.slice(0, 12).map(carte).join('') + '</div></section>';
  }

  vues.catalogue = function () {
    var c = cfg();
    var anim = c.animation || { bandeaux: [] };
    var imp = c.impact || {};
    $vue.innerHTML =
      '<header class="marque"><h1><small>Bailleul</small>Super Bon Plan</h1>' +
      '<div class="actions-tete"><button class="icone" id="vers-favoris" aria-label="Mes favoris">' + ICONES.coeur + '</button>' +
      '<button class="icone" id="vers-alertes" aria-label="Mes alertes">' + ICONES.cloche + '</button></div></header>' +
      (MODE_DEMO ? '<p class="bandeau-demo">Mode démo : articles fictifs, rien n\'est enregistré.</p>' : '') +
      htmlBandeaux(anim.bandeaux) +
      (anim.bandeaux && anim.bandeaux.length ? '' : '<p class="accroche">' + esc(c.messageAccueil || '') + '</p>') +
      (imp.kg > 0 ? '<p class="impact-ligne">' + ICONES.feuille + '<span>Ensemble, <b>' + (imp.co2 ? co2(imp.co2) : kg(imp.kg)) + '</b> évités grâce à vos achats d\'occasion</span></p>' : '') +
      '<div class="recherche">' + ICONES.loupe + '<input type="search" placeholder="Rechercher un article" aria-label="Rechercher un article" value="' + esc(etat.recherche) + '"></div>' +
      '<div class="puces" role="group" aria-label="Catégories">' +
        (etat.filtre ? '<button class="puce" data-filtre-off aria-pressed="true">' + esc(etat.filtre.libelle) + ' ×</button>' : '') +
        [''].concat(c.categories || []).map(function (cat) {
          return '<button class="puce" data-cat="' + esc(cat) + '" aria-pressed="' + (!etat.filtre && etat.categorie === cat) + '">' + esc(cat || 'Tout') + '</button>';
        }).join('') + '</div>' +
      '<div id="filtres-plus"></div>' +
      '<div id="vitrines"></div><div id="liste"></div>';
    activerBandeaux($vue, anim.bandeaux);
    setTimeout(popupAnimation, 800);
    document.getElementById('vers-favoris').onclick = function () { aller('favoris'); };
    document.getElementById('vers-alertes').onclick = function () { if (exigerConnexion('Connectez-vous pour être prévenu des nouveautés.', function () { aller('alertes', {}, true); })) aller('alertes'); };
    $vue.querySelector('.recherche input').addEventListener('input', function (e) { etat.recherche = e.target.value; dessinerListe(); });
    $vue.querySelector('.puces').addEventListener('click', function (e) {
      var b = e.target.closest('.puce'); if (!b) return;
      if (b.hasAttribute('data-filtre-off')) { etat.filtre = null; vues.catalogue(); return; }
      etat.categorie = b.dataset.cat; etat.filtre = null; etat.sousCategorie = ''; etat.tailles = []; etat.largeurMax = null;
      $vue.querySelector('.puces').querySelectorAll('.puce').forEach(function (p) { p.setAttribute('aria-pressed', String(p === b)); });
      dessinerListe();
    });
    document.getElementById('filtres-plus').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.sc != null) { etat.sousCategorie = etat.sousCategorie === b.dataset.sc ? '' : b.dataset.sc; etat.tailles = []; etat.largeurMax = null; }
      else if (b.hasAttribute('data-ouvrir-tailles')) etat.panneauTailles = !etat.panneauTailles;
      else if (b.hasAttribute('data-pour-moi')) {
        if (!(etat.utilisateur && etat.utilisateur.tailles && etat.utilisateur.tailles.length)) { if (exigerConnexion('Connectez-vous pour enregistrer vos tailles.', function () { aller('mesTailles', {}, true); })) aller('mesTailles'); return; }
        etat.pourMoi = !etat.pourMoi;
      }
      else if (b.dataset.taille != null) { var t = b.dataset.taille, i = etat.tailles.indexOf(t); if (i >= 0) etat.tailles.splice(i, 1); else etat.tailles.push(t); }
      else if (b.dataset.largeur != null) { var l = Number(b.dataset.largeur); etat.largeurMax = etat.largeurMax === l ? null : l; }
      else if (b.hasAttribute('data-effacer-tailles')) { etat.tailles = []; etat.largeurMax = null; etat.pourMoi = false; }
      dessinerListe();
    });
    brancherCartes(document.getElementById('vitrines'));
    brancherCartes(document.getElementById('liste'));
    if (etat.articles) dessinerListe();
    else {
      document.getElementById('liste').innerHTML = '<div class="grille">' + '<div class="squelette"></div>'.repeat(4) + '</div>';
      chargerArticles().then(dessinerListe).catch(function (e) {
        document.getElementById('liste').innerHTML = '<div class="vide"><strong>Catalogue indisponible</strong>' + esc(e.message) +
          '<button class="bouton second" id="reessayer">Réessayer</button></div>';
        document.getElementById('reessayer').onclick = function () { vues.catalogue(); };
      });
    }
  };
  function dessinerFiltresPlus(tous) {
    var z = document.getElementById('filtres-plus'); if (!z) return;
    var html = '';
    var scs = etat.categorie ? sousCats(etat.categorie) : [];
    if (scs.length) html += '<div class="puces sous" role="group" aria-label="Sous-catégories">' + scs.map(function (s) {
      var n = tous.filter(function (a) { return a.disponible && a.categorie === etat.categorie && a.sousCategorie === s.nom; }).length;
      return '<button class="puce" data-sc="' + esc(s.nom) + '" aria-pressed="' + (etat.sousCategorie === s.nom) + '">' + esc(s.nom) + (n ? ' <em>' + n + '</em>' : '') + '</button>';
    }).join('') + '</div>';
    var grilles = grillesActives();
    var aMesTailles = etat.utilisateur && etat.utilisateur.tailles && etat.utilisateur.tailles.length;
    if (grilles.length || aMesTailles) {
      var nbF = etat.tailles.length + (etat.largeurMax ? 1 : 0);
      html += '<div class="barre-filtres">' +
        (grilles.length ? '<button class="puce" data-ouvrir-tailles aria-expanded="' + etat.panneauTailles + '" aria-pressed="' + (nbF > 0) + '">Taille' + (nbF ? ' (' + nbF + ')' : '') + ' ' + (etat.panneauTailles ? '▴' : '▾') + '</button>' : '') +
        (!etat.categorie || etat.categorie === 'Vêtements' ? '<button class="puce" data-pour-moi aria-pressed="' + etat.pourMoi + '">À mes tailles</button>' : '') +
        (filtresTaillesActifs() ? '<button class="lien" data-effacer-tailles>Effacer</button>' : '') + '</div>';
      if (etat.panneauTailles && grilles.length) {
        var base = tous.filter(function (a) { return a.disponible && (!etat.categorie || a.categorie === etat.categorie) && (!etat.sousCategorie || a.sousCategorie === etat.sousCategorie); });
        html += '<div class="panneau-tailles">' + grilles.map(function (g) {
          var gr = ref().grilles[g]; if (!gr) return '';
          if (gr.type === 'largeur') return '<p class="meta">Largeur du meuble</p><div class="choix">' + gr.valeurs.map(function (v) {
            var n = base.filter(function (a) { var l = (a.specs && a.specs.largeur) || a.largeur; return l && l < Number(v); }).length;
            return '<button class="puce" data-largeur="' + esc(v) + '" aria-pressed="' + (etat.largeurMax === Number(v)) + '"' + (n ? '' : ' disabled') + '>' + esc(libelleLargeur(v)) + ' <em>' + n + '</em></button>';
          }).join('') + '</div>';
          var vals = gr.valeurs.map(function (v) { return [v, base.filter(function (a) { return tailleDans(a, [v]); }).length]; })
            .filter(function (x) { return x[1] || etat.tailles.indexOf(x[0]) >= 0; });
          if (!vals.length) return '<p class="meta">' + esc(g) + ' : aucune taille disponible en ce moment.</p>';
          return '<p class="meta">' + esc(g) + '</p><div class="choix">' + vals.map(function (x) {
            return '<button class="puce" data-taille="' + esc(x[0]) + '" aria-pressed="' + (etat.tailles.indexOf(x[0]) >= 0) + '">' + esc(x[0]) + ' <em>' + x[1] + '</em></button>';
          }).join('') + '</div>';
        }).join('') + '</div>';
      }
    }
    z.innerHTML = html;
  }
  function chargerArticles() {
    return api('articles', { version: etat.versionCatalogue || '' }).then(function (r) {
      if (r.inchange && etat.articles) return etat.articles;
      if (r.inchange) { etat.versionCatalogue = ''; return chargerArticles(); } // rien en mémoire : on redemande tout
      // On garde les fiches complètes déjà chargées pour les articles inchangés.
      var complets = {};
      (etat.articles || []).forEach(function (a) { if (!a.leger) complets[a.id] = a; });
      etat.articles = (r.articles || []).map(function (a) { var c = complets[a.id]; return c && c.statut === a.statut && c.prix === a.prix ? Object.assign(c, { nbAttente: a.nbAttente, aLaUne: a.aLaUne, etiquette: a.etiquette, disponible: a.disponible }) : a; });
      etat.versionCatalogue = r.version;
      stockage.set('catalogue', JSON.stringify({ version: r.version, articles: r.articles }));
      return etat.articles;
    });
  }

  function dessinerListe() {
    var zone = document.getElementById('liste'); if (!zone) return;
    var vitrines = document.getElementById('vitrines');
    var q = etat.recherche.trim();
    var qn = sansAccents(q);
    var tous = etat.articles || [];
    var mots = motsRecherche(q);
    var filtreActif = q || etat.categorie || etat.filtre || filtresTaillesActifs();
    dessinerFiltresPlus(tous);
    // Vitrines : à la une + pour vos alertes, seulement sur l'accueil sans filtre
    if (vitrines) {
      var dispo = tous.filter(function (a) { return a.disponible; });
      var pourVous = [];
      if (etat.alertes.length) {
        var semaine = Date.now() - 7 * 86400000;
        pourVous = dispo.filter(function (a) { return a.misEnLigne >= semaine && etat.alertes.some(function (al) { return al.active && correspond(al, a); }); });
      }
      vitrines.innerHTML = filtreActif ? '' : rangee('Pour vos alertes', pourVous, 'pour-vous') + rangee('À la une', dispo.filter(function (a) { return a.aLaUne; }), 'a-la-une');
    }
    var liste = tous.filter(function (a) {
      if (etat.categorie && a.categorie !== etat.categorie) return false;
      if (etat.sousCategorie && a.sousCategorie !== etat.sousCategorie) return false;
      if (!passeTailles(a)) return false;
      if (etat.filtre && etat.filtre.type === 'une' && !a.aLaUne) return false;
      if (etat.filtre && etat.filtre.type === 'etiquette' && a.etiquette !== etat.filtre.valeur) return false;
      if (!qn) return true;
      var sp = a.specs || {};
      var t = sansAccents([a.titre, a.description, a.taille, a.categorie, a.sousCategorie, a.etiquette, a.caracteristiques, sp.marque, sp.matiere, a.rech].join(' '));
      // Résultat exact si chaque mot est trouvé tel quel, « proche » s'il l'est grâce à un mot de la même famille.
      a._exact = mots.every(function (m) { return t.indexOf(racine(m)) >= 0; });
      return a._exact || mots.every(function (m) { return variantes(m).some(function (v) { return t.indexOf(racine(v)) >= 0; }); });
    }).sort(function (x, y) { return ((y._exact ? 2 : 0) + (y.disponible ? 1 : 0)) - ((x._exact ? 2 : 0) + (x.disponible ? 1 : 0)); });
    var nbExacts = qn ? liste.filter(function (a) { return a._exact; }).length : liste.length;
    noterRecherche(q, liste.length, 'catalogue');
    var lienAlerte = q ? '<button class="lien" id="alerte-recherche">' + ICONES.cloche + ' Me prévenir des nouveautés « ' + esc(q) + ' »</button>' : '';
    if (!liste.length) {
      zone.innerHTML = '<div class="vide"><strong>' + (filtreActif ? 'Aucun article ne correspond' : 'Aucun article pour le moment') + '</strong>' +
        (q ? 'Créez une alerte : vous recevrez un mail dès qu\'un article « ' + esc(q) + ' » arrive.<button class="bouton" id="alerte-recherche">Créer l\'alerte</button>'
           : filtreActif ? 'Essayez une autre catégorie ou un autre mot.' : 'De nouvelles pièces arrivent chaque semaine. Revenez bientôt.') + '</div>';
    } else {
      var PAS = 40, affiches = Math.min(PAS, liste.length);
      var rendreCartes = function (debut, fin) {
        return liste.slice(debut, fin).map(function (a, i) {
          var sep = qn && debut + i === nbExacts && nbExacts < liste.length
            ? '<h2 class="section separateur">' + (nbExacts ? 'Proche de votre recherche' : 'Rien de « ' + esc(q) + ' » pour l\'instant, mais dans la même famille') + '</h2>' : '';
          return sep + carte(a);
        }).join('');
      };
      zone.innerHTML = (filtreActif ? '' : '<h2 class="section">Tous les articles</h2>') + '<div class="grille" id="grille">' + rendreCartes(0, affiches) + '</div>' +
        (liste.length > affiches ? '<div id="suite" class="suite">Chargement des articles suivants…</div>' : '') + lienAlerte +
        (filtreActif ? '' : bandeauInstallation()) + (filtreActif ? '' : '<button class="carte-invite" id="carte-invite">' + ICONES.partage + '<span><b>Vous aimez l\'appli ?</b>Envoyez-la à un proche par SMS, WhatsApp, mail ou Facebook.</span></button>');
      var ci = document.getElementById('carte-invite'); if (ci) ci.onclick = function () { aller('inviter'); };
      brancherInstallation();
      // Affichage progressif : 40 articles, puis 40 de plus quand on approche du bas de la liste.
      var suite = document.getElementById('suite');
      if (suite && window.IntersectionObserver) {
        if (etat.observateur) etat.observateur.disconnect();
        etat.observateur = new IntersectionObserver(function (entrees) {
          if (!entrees[0].isIntersecting) return;
          var g = document.getElementById('grille'); if (!g) return;
          g.insertAdjacentHTML('beforeend', rendreCartes(affiches, affiches + PAS));
          affiches += PAS;
          if (affiches >= liste.length) { etat.observateur.disconnect(); suite.remove(); }
        }, { rootMargin: '600px' });
        etat.observateur.observe(suite);
      } else if (suite) { document.getElementById('grille').insertAdjacentHTML('beforeend', rendreCartes(affiches, liste.length)); suite.remove(); }
    }
    var la = document.getElementById('alerte-recherche');
    if (la) la.onclick = function () {
      var pre = { motsCles: q, categorie: etat.categorie, sousCategorie: etat.sousCategorie, taille: etat.tailles.length === 1 ? etat.tailles[0] : '' };
      if (exigerConnexion('Connectez-vous pour créer une alerte.', function () { aller('alertes', { prerempli: pre }, true); })) aller('alertes', { prerempli: pre });
    };
  }

  // ================= Fiche article =================
  function trouverArticle(id) { return (etat.articles || []).filter(function (x) { return x.id === id; })[0]; }
  vues.article = function (p) {
    var a = trouverArticle(p.id);
    if (!a) { retour(); return; }
    if (a.leger && !p.chargement) {
      // Fiche affichée tout de suite avec ce qu'on a, complétée dès que le détail arrive (souvent déjà demandé au toucher).
      (fichesEnCours[a.id] || api('article', { id: a.id })).then(function (complet) {
        Object.assign(a, complet); a.leger = false;
        var c0 = etat.pile[etat.pile.length - 1];
        if (c0 && c0.nom === 'article' && c0.params.id === a.id) { var y = window.scrollY; vues.article({ id: a.id, chargement: true }); window.scrollTo(0, y); }
      }).catch(function () {});
    }
    var c = cfg();
    var photos = a.photos.length ? a.photos : [''];
    var monAttente = etat.mesAttentes.filter(function (w) { return w.article && w.article.id === a.id; })[0];
    $vue.innerHTML = boutonRetour() +
      '<div class="galerie"><div class="defile">' + photos.map(function (ref, i) { return '<div>' + imgPhoto(ref, a.titre + ' – photo ' + (i + 1), 1200) + '</div>'; }).join('') + '</div>' +
        (photos.length > 1 ? '<div class="points">' + photos.map(function (_, i) { return '<i' + (i ? '' : ' class="actif"') + '></i>'; }).join('') + '</div>' : '') +
        (a.etiquette ? '<span class="etiq grand">' + esc(a.etiquette) + '</span>' : '') +
        htmlPrix(a.prix, a.prixInitial, '', true) + '</div>' +
      '<article class="fiche"><h2>' + esc(a.titre) + '</h2>' +
        '<div class="details">' + [a.sousCategorie ? a.categorie + ' › ' + a.sousCategorie : a.categorie, a.taille, a.etat].filter(Boolean).map(function (d) { return '<span>' + esc(d) + '</span>'; }).join('') + '</div>' +
        '<div class="rangee-boutons"><button class="bouton second petit" data-fav="' + esc(a.id) + '" aria-pressed="' + estFavori(a.id) + '">' + ICONES.coeur + 'Favori</button>' +
        '<button class="bouton second petit" id="partager">' + ICONES.partage + 'Partager</button>' +
        '<button class="bouton second petit" id="question">' + ICONES.bulle + 'Poser une question</button></div>' +
        (a.description ? '<p class="desc">' + esc(a.description) + '</p>' : '') + htmlSpecs(a) +
        (a.preparePar || a.poids || a.co2 ? '<section class="encadre vert">' +
          (a.preparePar ? '<p><b>Trié et préparé par ' + esc(a.preparePar) + '</b>, de l\'équipe de ' + esc(c.nomEbe || 'l\'EBE') + '.</p>' : '') +
          (a.co2 ? '<p>En le choisissant plutôt que neuf, vous évitez environ <b>' + co2(a.co2) + '</b> (ADEME)' + (a.poids ? ' et ' + kg(a.poids) + ' de déchets' : '') + '.</p>' : a.poids ? '<p>En le choisissant, vous évitez environ ' + kg(a.poids) + ' de déchets.</p>' : '') + '</section>' : '') +
        '<section class="encadre"><h3>Réservez, puis retirez sous ' + (c.delaiJours || 7) + ' jours</h3>' +
          '<p>' + esc(c.point && c.point.nom) + ', ' + esc(c.point && c.point.adresse) + '</p><p>' + esc(c.point && c.point.horaires) + '</p>' +
          '<p>Paiement sur place, au retrait.</p></section></article>' +
      '<div class="barre-action" id="barre"></div>';
    var barre = document.getElementById('barre');
    if (a.disponible) {
      barre.innerHTML = '<button class="bouton" id="act">Réserver cet article</button>';
      document.getElementById('act').onclick = function () { demanderReservation(a); };
    } else if (monAttente && monAttente.statut === 'proposé') {
      barre.innerHTML = '<p class="info-barre">Il vous est proposé en priorité jusqu\'au ' + esc(dateLongue(monAttente.offreJusqua)) + ' à ' + heure(monAttente.offreJusqua) + '.</p><button class="bouton" id="act">Confirmer la réservation</button>';
      document.getElementById('act').onclick = function () { demanderReservation(a); };
    } else if (monAttente) {
      barre.innerHTML = '<p class="info-barre">Vous êtes n°' + monAttente.rang + ' sur la liste d\'attente. Vous serez prévenu (notification et mail) s\'il se libère.</p><button class="bouton second" id="act">Quitter la liste d\'attente</button>';
      document.getElementById('act').onclick = function () {
        var b = this; chargement(b, true);
        api('quitterAttente', { id: monAttente.id }).then(function () { return rafraichirMesAttentes(); }).then(function () { toast('Vous avez quitté la liste d\'attente.'); vues.article(p); }).catch(function (e) { chargement(b, false); erreur(e); });
      };
    } else {
      barre.innerHTML = '<p class="info-barre">Déjà réservé' + (a.nbAttente ? ', ' + a.nbAttente + ' personne' + (a.nbAttente > 1 ? 's' : '') + ' en attente' : '') + '. S\'il n\'est pas retiré, il sera proposé à la liste d\'attente.</p><button class="bouton" id="act">Me prévenir s\'il se libère</button>';
      document.getElementById('act').onclick = function () {
        if (!exigerConnexion('Connectez-vous pour rejoindre la liste d\'attente.', function () { aller('article', { id: a.id }, true); })) return;
        var b = this; chargement(b, true);
        api('rejoindreAttente', { idArticle: a.id }).then(function (r) { a.nbAttente = (a.nbAttente || 0) + 1; return rafraichirMesAttentes().then(function () { return r; }); })
          .then(function (r) { toast('C\'est noté : vous êtes n°' + r.rang + ' sur la liste d\'attente.'); vues.article(p); Push.proposer('S\'il se libère, vous n\'aurez que ' + (cfg().delaiOffreHeures || 24) + ' h pour le confirmer.'); })
          .catch(function (e) { chargement(b, false); erreur(e); });
      };
    }
    var defile = $vue.querySelector('.galerie .defile');
    defile.addEventListener('scroll', function () {
      var i = Math.round(defile.scrollLeft / defile.clientWidth);
      $vue.querySelectorAll('.galerie .points i').forEach(function (pt, j) { pt.className = i === j ? 'actif' : ''; });
    }, { passive: true });
    document.getElementById('partager').onclick = function () { partager(a); };
    document.getElementById('question').onclick = function () {
      if (exigerConnexion('Connectez-vous pour poser une question à l\'équipe.', function () { aller('conversation', { idArticle: a.id }, true); })) aller('conversation', { idArticle: a.id });
    };
  };

  function partager(a) {
    var c = cfg();
    var url = c.urlPartage ? c.urlPartage + encodeURIComponent(a.id) : '';
    var texte = a.titre + ' à ' + prix(a.prix) + ' sur Bailleul Super Bon Plan';
    var donnees = { title: a.titre, text: texte, url: url || undefined, dialogTitle: 'Partager cet article' };
    if (Plugins.Share) return Plugins.Share.share(donnees).catch(function () {});
    if (navigator.share) return navigator.share(donnees).catch(function () {});
    var t = texte + (url ? ' ' + url : '');
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { toast('Lien copié.'); });
  }

  function demanderReservation(a) {
    if (!exigerConnexion('Connectez-vous pour réserver « ' + a.titre + ' ».', function () { aller('article', { id: a.id }, true); demanderReservation(a); })) return;
    var u = etat.utilisateur || {};
    if (u.bloqueJusqua && u.bloqueJusqua > Date.now()) {
      modale('Réservations suspendues', 'Après plusieurs réservations non retirées, votre compte ne peut plus réserver jusqu\'au <b>' + esc(dateLongue(u.bloqueJusqua)) + '</b>. Vous pouvez toujours passer au point de collecte.', [{ texte: 'J\'ai compris', valeur: true }]);
      return;
    }
    aller('reserver', { id: a.id });
  }

  // ================= Réservation : choix du créneau =================
  function joursDisponibles(limiteMs, joursPoint) {
    var c = cfg(), jours = [], d = new Date(); d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + (c.delaiPreparationJours == null ? 1 : c.delaiPreparationJours)); // pas de retrait le jour même
    var ouverts = (joursPoint && joursPoint.length) ? joursPoint : (c.joursOuverture || []).length ? c.joursOuverture : JOURS;
    while (d.getTime() <= limiteMs && jours.length < 10) {
      if (ouverts.indexOf(JOURS[d.getDay()]) >= 0) jours.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return jours;
  }
  function pointsPour(a) {
    var c = cfg(), pts = c.points || [];
    var vol = a.volumineux || (c.categoriesVolumineuses || []).indexOf(a.categorie) >= 0;
    var l = pts.filter(function (x) { return vol ? x.volumineux : x.vente; });
    return l.length ? l : pts;
  }
  function pointLocation() { var pts = cfg().points || []; return pts.filter(function (x) { return x.location; })[0] || pts[0] || cfg().point || {}; }
  vues.reserver = function (p) {
    var a = trouverArticle(p.id); if (!a) { retour(); return; }
    var c = cfg();
    var limite = new Date(); limite.setDate(limite.getDate() + (c.delaiJours || 7)); limite.setHours(23, 59, 0, 0);
    var permis = pointsPour(a);
    var choix = { date: '', moment: '', point: (p.point) || (permis.length === 1 ? permis[0].nom : (etat.dernierPoint && permis.some(function (x) { return x.nom === etat.dernierPoint; }) ? etat.dernierPoint : '')) };
    var ptChoisi = function () { return permis.filter(function (x) { return x.nom === choix.point; })[0]; };
    var jours = joursDisponibles(limite.getTime(), ptChoisi() && ptChoisi().jours);
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">Où et quand ?</h1>' +
      '<p class="sous-titre">« ' + esc(a.titre) + ' », ' + prix(a.prix) + ' à régler sur place. Retrait possible à partir de demain, jusqu\'au ' + esc(dateLongue(limite)) + '.</p>' +
      '<h2 class="section">Point de retrait</h2>' +
      (permis.length < (c.points || []).length ? '<p class="meta">Article volumineux : retrait uniquement dans ' + (permis.length > 1 ? 'ces lieux' : 'ce lieu') + '.</p>' : '') +
      '<div class="points-retrait" id="points">' + permis.map(function (x) {
        return '<button class="point-retrait" data-point="' + esc(x.nom) + '" aria-pressed="' + (x.nom === choix.point) + '"><b>' + esc(x.nom) + '</b><span>' + esc(x.adresse) + '</span>' + (x.horaires ? '<span>' + esc(x.horaires) + '</span>' : '') + '</button>';
      }).join('') + '</div>' +
      '<h2 class="section">Jour</h2><div class="choix" id="jours">' + jours.map(function (d) {
        var j = joursRestants(d.getTime());
        return '<button class="puce" data-date="' + iso(d) + '" aria-pressed="false">' + (j === 0 ? 'Aujourd\'hui' : j === 1 ? 'Demain' : esc(dateLongue(d.getTime()))) + '</button>';
      }).join('') + '<button class="puce" data-date="" aria-pressed="true">Je ne sais pas encore</button></div>' +
      ((c.creneaux || []).length ? '<h2 class="section">Moment</h2><div class="choix" id="moments">' + c.creneaux.map(function (m) {
        return '<button class="puce" data-moment="' + esc(m) + '" aria-pressed="false" disabled>' + esc(m) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="barre-action"><button class="bouton" id="confirmer"' + (choix.point ? '' : ' disabled') + '>' + (choix.point ? 'Confirmer la réservation' : 'Choisissez un point de retrait') + '</button></div>';
    var zj = document.getElementById('jours'), zm = document.getElementById('moments');
    document.getElementById('points').onclick = function (e) {
      var b = e.target.closest('[data-point]'); if (!b) return;
      etat.dernierPoint = b.dataset.point;
      p.point = b.dataset.point; vues.reserver(p); // redessine les jours d'ouverture de ce point
    };
    zj.onclick = function (e) {
      var b = e.target.closest('.puce'); if (!b) return;
      choix.date = b.dataset.date;
      zj.querySelectorAll('.puce').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      if (zm) zm.querySelectorAll('.puce').forEach(function (x) { x.disabled = !choix.date; if (!choix.date) x.setAttribute('aria-pressed', 'false'); });
      if (!choix.date) choix.moment = '';
    };
    if (zm) zm.onclick = function (e) {
      var b = e.target.closest('.puce'); if (!b || b.disabled) return;
      choix.moment = b.dataset.moment;
      zm.querySelectorAll('.puce').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    };
    document.getElementById('confirmer').onclick = function () {
      var btn = this; chargement(btn, true, 'Réservation en cours…');
      if (!choix.point) { toast('Choisissez un point de retrait.', true); chargement(btn, false); return; }
      api('reserver', { idArticle: a.id, creneau: choix.date ? { date: choix.date, moment: choix.moment } : null, point: choix.point }).then(function (resa) {
        a.disponible = false; a.statut = 'réservé';
        etat.mesAttentes = etat.mesAttentes.filter(function (w) { return !w.article || w.article.id !== a.id; });
        programmerRappel(resa);
        majMemoire('mesResas{}', function (m) { m.achats.reservations = [Object.assign({ prixPaye: a.prix }, resa)].concat(m.achats.reservations || []); });
        etat.pile = [{ nom: 'catalogue', params: {} }];
        aller('confirmation', { resa: resa });
      }).catch(function (e) { chargement(btn, false); erreur(e); if (/Trop tard/.test(e.message)) etat.articles = null; });
    };
  };

  // ================= Confirmation =================
  vues.confirmation = function (p) {
    var r = p.resa, c = cfg();
    $vue.innerHTML = '<div class="bravo"><h1 class="titre-page">C\'est réservé !</h1>' +
      '<p class="sous-titre">« ' + esc(r.article.titre) + ' » est mis de côté pour vous.</p>' +
      '<p>Votre code de retrait</p><div class="gros-code">' + esc(r.code) + '</div>' +
      '<p>Un mail de confirmation vient de vous être envoyé.</p>' +
      '<section class="encadre"><h3>' + (r.creneau ? 'Passage prévu : ' + esc(r.creneau) : 'À retirer avant le ' + esc(dateLongue(r.limite))) + '</h3>' +
        (r.creneau ? '<p>Au plus tard le ' + esc(dateLongue(r.limite)) + '.</p>' : '') +
        (function () { var pt = (c.points || []).filter(function (x) { return x.nom === r.point; })[0] || c.point || {}; return '<p><b>' + esc(pt.nom) + '</b>, ' + esc(pt.adresse) + '</p>' + (pt.horaires ? '<p>' + esc(pt.horaires) + '</p>' : ''); })() +
        '<p>Montant à régler sur place : ' + prix(r.article.prix) + '</p></section>' +
      (r.article.co2 || r.article.poids ? '<p class="impact-ligne">' + ICONES.feuille + '<span>Merci : <b>' + (r.article.co2 ? co2(r.article.co2) : kg(r.article.poids)) + '</b> évités, à compter dans votre bilan une fois l\'article retiré.</span></p>' : '') +
      '<div class="pile"><button class="bouton" id="voir">Voir mes réservations</button><button class="bouton second" id="cont">Continuer mes achats</button>' +
      '<button class="lien" id="inv">' + ICONES.partage + ' Faire découvrir l\'appli à un proche</button></div></div>';
    document.getElementById('inv').onclick = function () { aller('inviter'); };
    document.getElementById('voir').onclick = function () { ouvrirOnglet('reservations'); };
    document.getElementById('cont').onclick = function () { ouvrirOnglet('catalogue'); };
  };

  // ================= Notifications locales (rappel la veille) =================
  function idNotif(code) { var h = 0; for (var i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) | 0; return Math.abs(h) % 2000000000; }
  function programmerRappel(resa) {
    var LN = Plugins.LocalNotifications; if (!LN) return;
    var quand = new Date(resa.limite - 24 * 3600000);
    quand.setHours(10, 0, 0, 0);
    if (quand.getTime() < Date.now() + 3600000) return;
    LN.requestPermissions().then(function (perm) {
      if (perm.display !== 'granted') return;
      return LN.schedule({ notifications: [{
        id: idNotif(resa.code), title: 'Dernier jour pour votre bon plan',
        body: '« ' + resa.article.titre + ' » vous attend jusqu\'à demain soir. Code ' + resa.code + '.',
        schedule: { at: quand, allowWhileIdle: true }
      }] });
    }).catch(function () {});
  }
  function annulerRappel(code) { var LN = Plugins.LocalNotifications; if (LN) LN.cancel({ notifications: [{ id: idNotif(code) }] }).catch(function () {}); }

  // ================= Connexion =================
  vues.connexion = function (p) {
    var etape = p.etape || 'email';
    var html = boutonRetour();
    if (etape === 'email') {
      html += '<h1 class="titre-page">Se connecter</h1><p class="sous-titre">' + esc(p.raison || 'Recevez un code par mail : pas de mot de passe à retenir.') + '</p>' +
        '<form class="pile" id="f"><label class="champ">Votre adresse mail<input type="email" name="email" autocomplete="email" inputmode="email" required value="' + esc(p.email || '') + '"></label>' +
        '<button class="bouton">Recevoir mon code</button></form>';
    } else if (etape === 'inscription') {
      html += '<h1 class="titre-page">Créer votre compte</h1><p class="sous-titre">Première visite avec ' + esc(p.email) + '. Encore quelques infos.</p>' +
        '<form class="pile" id="f"><label class="champ">Prénom<input name="prenom" autocomplete="given-name" required></label>' +
        '<label class="champ">Nom <small>(facultatif)</small><input name="nom" autocomplete="family-name"></label>' +
        '<label class="champ">Téléphone <small>(facultatif, pour vous joindre au sujet d\'un retrait)</small><input name="telephone" type="tel" autocomplete="tel"></label>' +
        champsProfil({}) +
        '<label class="case"><input type="checkbox" name="consentement" required><span>J\'accepte les <a href="#" id="lien-cgu">conditions d\'utilisation</a> et la <a href="#" id="lien-conf">politique de confidentialité</a>.</span></label>' +
        '<button class="bouton">Recevoir mon code</button></form>';
    } else {
      html += '<h1 class="titre-page">Entrez le code</h1><p class="sous-titre">Envoyé à ' + esc(p.email) + '. Pensez à regarder dans les spams.</p>' +
        '<form class="pile" id="f"><label class="champ code-saisie">Code à 6 chiffres<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></label>' +
        '<button class="bouton">Me connecter</button><button type="button" class="lien" id="renvoyer">Renvoyer un code</button></form>';
    }
    $vue.innerHTML = html;
    var lc = document.getElementById('lien-conf'); if (lc) lc.onclick = function (e) { e.preventDefault(); ouvrirLien(cfg().urlConfidentialite); };
    var lg = document.getElementById('lien-cgu'); if (lg) lg.onclick = function (e) { e.preventDefault(); ouvrirLien(cfg().urlConditions); };
    var f = document.getElementById('f');
    var premier = f.querySelector('input'); if (premier) setTimeout(function () { premier.focus(); }, 50);
    f.onsubmit = function (e) {
      e.preventDefault();
      var btn = f.querySelector('.bouton'); var d = Object.fromEntries(new FormData(f));
      chargement(btn, true);
      if (etape === 'code') {
        api('verifierCode', { email: p.email, code: d.code }).then(function (r) {
          etat.jeton = r.jeton; etat.utilisateur = r.utilisateur;
          return stockage.set('jeton', r.jeton);
        }).then(chargerDonneesPerso).then(function () {
          toast('Bienvenue ' + (etat.utilisateur.prenom || '') + ' !');
          var suite = etat.apresConnexion; etat.apresConnexion = null;
          while (etat.pile.length && etat.pile[etat.pile.length - 1].nom === 'connexion') etat.pile.pop();
          if (etat.utilisateur && etat.utilisateur.role) { etat.modeClient = false; ouvrirOnglet('eq-accueil'); }
          else if (suite) suite(); else if (etat.pile.length) afficher(); else ouvrirOnglet('compte');
          verifierProfil();
        }).catch(function (err) { chargement(btn, false); erreur(err); });
        return;
      }
      var email = etape === 'email' ? d.email : p.email;
      var envoi = etape === 'email' ? { email: email } : { email: email, prenom: d.prenom, nom: d.nom, telephone: d.telephone, consentement: !!d.consentement, profil: { age: d.age, commune: d.commune, connu: d.connu } };
      api('demanderCode', envoi).then(function (r) {
        if (r.nouveauCompte) aller('connexion', { etape: 'inscription', email: email });
        else aller('connexion', { etape: 'code', email: email });
      }).catch(function (err) { chargement(btn, false); erreur(err); });
    };
    var renv = document.getElementById('renvoyer');
    if (renv) renv.onclick = function () { api('demanderCode', { email: p.email }).then(function () { toast('Nouveau code envoyé.'); }).catch(erreur); };
  };

  function ouvrirLien(url) {
    if (!url) return;
    if (Plugins.Browser) Plugins.Browser.open({ url: url }); else window.open(url, '_blank');
  }

  // ================= Mes réservations =================
  function rafraichirMesAttentes() {
    if (!etat.jeton) return Promise.resolve();
    return api('mesReservations').then(function (r) { etat.mesAttentes = r.attentes || []; majPastille(); return r; });
  }
  vues.reservations = function () {
    $vue.innerHTML = '<h1 class="titre-page">Mes réservations</h1>';
    if (!etat.jeton) {
      $vue.innerHTML += '<div class="vide"><strong>Pas encore connecté</strong>Connectez-vous pour réserver et retrouver vos articles ici.<button class="bouton" id="cx">Se connecter</button></div>';
      document.getElementById('cx').onclick = function () { etat.apresConnexion = function () { ouvrirOnglet('reservations'); }; aller('connexion', {}); };
      return;
    }
    $vue.innerHTML += '<div id="mes-locations"></div><div id="liste"><div class="resa"><div class="vignette squelette"></div><div></div></div></div>';
    avecMemoire('mesResas').then(function (tout) {
      if (cfg().location && cfg().location.active) dessinerMesLocations(tout.locations || []);
      var r = tout.achats;
      etat.mesAttentes = r.attentes || []; majPastille();
      var zone = document.getElementById('liste'); if (!zone) return;
      var liste = r.reservations, attentes = r.attentes || [];
      var offres = attentes.filter(function (w) { return w.statut === 'proposé'; });
      var enAttente = attentes.filter(function (w) { return w.statut !== 'proposé'; });
      var actives = liste.filter(function (x) { return x.statut === 'active'; });
      var passees = liste.filter(function (x) { return x.statut !== 'active'; });
      if (!liste.length && !attentes.length) {
        zone.innerHTML = '<div class="vide"><strong>Aucune réservation</strong>Repérez une pièce dans le catalogue et réservez-la en un geste.<button class="bouton" id="cat">Voir le catalogue</button></div>';
        document.getElementById('cat').onclick = function () { ouvrirOnglet('catalogue'); };
        return;
      }
      var c = cfg();
      zone.innerHTML =
        (offres.length ? '<h2 class="section">Il s\'est libéré pour vous</h2>' + offres.map(carteOffre).join('') : '') +
        (actives.length ? (offres.length ? '<h2 class="section">En cours</h2>' : '<p class="sous-titre">Présentez le code jaune au moment du retrait.</p>') + actives.map(carteResa).join('') +
          '<section class="encadre" style="margin-top:16px"><h3>Où retirer ?</h3><p>' + esc(c.point && c.point.nom) + ', ' + esc(c.point && c.point.adresse) + '</p><p>' + esc(c.point && c.point.horaires) + '</p></section>'
          : offres.length ? '' : '<p class="sous-titre">Aucune réservation en cours.</p>') +
        (enAttente.length ? '<h2 class="section">Listes d\'attente</h2>' + enAttente.map(carteAttente).join('') : '') +
        (passees.length ? '<h2 class="section">Historique</h2>' + passees.map(carteResa).join('') : '');
      zone.onclick = function (e) {
        var conf = e.target.closest('[data-confirmer]');
        if (conf) { var w = offres.filter(function (x) { return x.id === conf.dataset.confirmer; })[0]; garantirArticle(w.article); demanderReservation(w.article); return; }
        var q = e.target.closest('[data-quitter]');
        if (q) { chargement(q, true); api('quitterAttente', { id: q.dataset.quitter }).then(function () { etat.articles = null; toast('C\'est fait.'); vues.reservations(); }).catch(function (err) { chargement(q, false); erreur(err); }); return; }
        var ec = e.target.closest('[data-ecrire]');
        if (ec && ec.dataset.ecrire) { aller('conversation', { idArticle: ec.dataset.ecrire }); return; }
        var va = e.target.closest('[data-voir-article]');
        if (va && va.dataset.voirArticle) { voirArticle(va.dataset.voirArticle); return; }
        var cr = e.target.closest('[data-creneau]');
        if (cr) { var resa = actives.filter(function (x) { return x.code === cr.dataset.creneau; })[0]; aller('creneau', { resa: resa }); return; }
        var b = e.target.closest('[data-annuler]'); if (!b) return;
        var code = b.dataset.annuler;
        modale('Annuler cette réservation ?', 'L\'article sera proposé à la liste d\'attente ou remis en vente.', [
          { texte: 'Oui, annuler', valeur: true, style: 'danger' }, { texte: 'Garder ma réservation', valeur: false, style: 'second' }
        ]).then(function (ok) {
          if (!ok) return;
          chargement(b, true);
          api('annulerReservation', { code: code }).then(function () {
            annulerRappel(code); etat.articles = null; toast('Réservation annulée.');
            majMemoire('mesResas{}', function (m) { (m.achats.reservations || []).forEach(function (x) { if (x.code === code) x.statut = 'annulée'; }); });
            vues.reservations();
          })
            .catch(function (err) { chargement(b, false); erreur(err); });
        });
      };
    }).catch(erreur);
  };
  function garantirArticle(a) { if (!a) return; etat.articles = etat.articles || []; if (!trouverArticle(a.id)) etat.articles.push(a); }

  function vignette(a) { return '<div class="vignette">' + imgPhoto(a.photos && a.photos[0], a.titre, 300) + '</div>'; }
  function carteOffre(w) {
    return '<div class="resa offre">' + vignette(w.article) + '<div><h3>' + esc(w.article.titre) + '</h3><p class="meta">' + prix(w.article.prix) + '</p>' +
      '<span class="etiquette urgent">À confirmer avant ' + esc(dateLongue(w.offreJusqua)) + ', ' + heure(w.offreJusqua) + '</span></div>' +
      '<div class="actions"><button class="bouton petit" data-confirmer="' + esc(w.id) + '">Je le prends</button><button class="bouton second petit" data-quitter="' + esc(w.id) + '">Je passe mon tour</button></div></div>';
  }
  function carteAttente(w) {
    return '<div class="resa">' + vignette(w.article) + '<div><h3>' + esc(w.article.titre) + '</h3><p class="meta">' + prix(w.article.prix) + '</p>' +
      '<span class="etiquette fini">Vous êtes n°' + w.rang + ' sur la liste</span></div>' +
      '<div class="actions"><button class="bouton second petit" data-quitter="' + esc(w.id) + '">Quitter la liste</button></div></div>';
  }
  function carteResa(r) {
    var etiquette;
    if (r.statut === 'active') {
      var j = joursRestants(r.limite);
      etiquette = j <= 0 ? '<span class="etiquette urgent">Dernier jour : à retirer aujourd\'hui</span>'
        : j === 1 ? '<span class="etiquette urgent">À retirer avant demain soir</span>'
        : '<span class="etiquette ok">Encore ' + j + ' jours, jusqu\'au ' + esc(dateLongue(r.limite)) + '</span>';
    } else {
      var libelles = { 'retirée': 'Retirée', 'expirée': 'Non retirée, remise en vente', 'annulée': 'Annulée' };
      etiquette = '<span class="etiquette fini">' + esc(libelles[r.statut] || r.statut) + '</span>';
    }
    var actif = r.statut === 'active';
    return '<div class="resa' + (actif ? '' : ' passee') + '"><button class="vers-produit" data-voir-article="' + esc(r.article.id || '') + '" aria-label="Revoir l\'article">' + vignette(r.article) + '</button>' +
      '<div><h3><button class="lien-titre" data-voir-article="' + esc(r.article.id || '') + '">' + esc(r.article.titre) + '</button></h3><p class="meta">' + prix(r.prixPaye || r.article.prix) + (actif ? ', à payer au retrait' : '') + '</p>' +
      (actif && r.point ? '<p class="meta">Retrait : ' + esc(r.point) + '</p>' : '') +
      (actif ? '<span class="code-retrait">' + esc(r.code) + '</span><br>' : '') + etiquette +
      (actif ? '<p class="meta creneau">' + (r.creneau ? 'Passage prévu : ' + esc(r.creneau) : 'Passage : pas encore indiqué') + ' <button class="lien" data-creneau="' + esc(r.code) + '">' + (r.creneau ? 'Modifier' : 'Indiquer') + '</button></p>' : '') + '</div>' +
      (actif ? '<div class="actions"><button class="bouton second petit" data-ecrire="' + esc(r.article.id || '') + '">' + ICONES.bulle + 'Écrire à l\'équipe</button><button class="bouton second petit" data-annuler="' + esc(r.code) + '">Annuler la réservation</button></div>' : '') + '</div>';
  }

  vues.creneau = function (p) {
    var r = p.resa, c = cfg(), choix = { date: '', moment: '' };
    var jours = joursDisponibles(r.limite);
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">Changer de créneau</h1><p class="sous-titre">« ' + esc(r.article.titre) + ' », à retirer avant le ' + esc(dateLongue(r.limite)) + '.</p>' +
      '<h2 class="section">Jour</h2><div class="choix" id="jours">' + jours.map(function (d) { return '<button class="puce" data-date="' + iso(d) + '" aria-pressed="false">' + esc(dateLongue(d.getTime())) + '</button>'; }).join('') + '</div>' +
      ((c.creneaux || []).length ? '<h2 class="section">Moment</h2><div class="choix" id="moments">' + c.creneaux.map(function (m) { return '<button class="puce" data-moment="' + esc(m) + '" aria-pressed="false">' + esc(m) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="barre-action"><button class="bouton" id="ok" disabled>Enregistrer</button></div>';
    var ok = document.getElementById('ok');
    document.getElementById('jours').onclick = function (e) { var b = e.target.closest('.puce'); if (!b) return; choix.date = b.dataset.date; this.querySelectorAll('.puce').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); ok.disabled = false; };
    var zm = document.getElementById('moments');
    if (zm) zm.onclick = function (e) { var b = e.target.closest('.puce'); if (!b) return; choix.moment = b.dataset.moment; zm.querySelectorAll('.puce').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); };
    ok.onclick = function () {
      chargement(ok, true);
      api('changerCreneau', { code: r.code, creneau: choix }).then(function () { toast('Créneau enregistré. L\'équipe est prévenue.'); retour(); }).catch(function (e) { chargement(ok, false); erreur(e); });
    };
  };

  // ================= Compte =================
  vues.compte = function () {
    var c = cfg();
    var u = etat.utilisateur || {};
    var menu = [
      ['inviter', ICONES.partage, 'Inviter un proche', '', 'accent'],
      ['favoris', ICONES.coeur, 'Mes favoris', etat.favoris.length ? String(etat.favoris.length) : ''],
      ['mesTailles', ICONES.etoile, 'Mes tailles', u.tailles && u.tailles.length ? String(u.tailles.length) : ''],
      ['alertes', ICONES.cloche, 'Mes alertes nouveautés', etat.alertes.length ? String(etat.alertes.length) : '']
    ];
    if (etat.jeton) menu.splice(1, 0, ['bilan', ICONES.feuille, 'Mon bilan d\'impact', '']);
    if (c.dons && c.dons.actifs) { menu.push(['don', ICONES.feuille, 'Donner un objet', '']); if (etat.jeton) menu.push(['mesDons', ICONES.feuille, 'Mes propositions de dons', '']); }
    menu.push(['apropos', ICONES.etoile, 'Qui sommes-nous ?', '']);
    menu.push(['retour', ICONES.bulle, 'Signaler un bug ou une idée', '']);
    if (etat.jeton) menu.push(['reglages', ICONES.reglages, 'Paramètres du compte', '']);
    var html = '';
    if (!etat.jeton) {
      html = '<h1 class="titre-page">Compte</h1><div class="vide" style="padding:24px 12px"><strong>Bienvenue</strong>Un compte suffit pour réserver. Pas de mot de passe : un code par mail.<button class="bouton" id="cx">Se connecter ou créer un compte</button></div>';
    } else {
      var imp = u.impact || {};
      html = '<h1 class="titre-page">Bonjour ' + esc(u.prenom || '') + '</h1><p class="sous-titre">' + esc(u.email || '') + '</p>' +
        (u.bloqueJusqua && u.bloqueJusqua > Date.now() ? '<section class="encadre alerte"><h3>Réservations suspendues</h3><p>Après plusieurs réservations non retirées, vous pourrez de nouveau réserver à partir du ' + esc(dateLongue(u.bloqueJusqua)) + '.</p></section>' : '') +
        '<button class="impact-carte cliquable" id="vers-bilan"><p class="impact-chiffre">' + co2(imp.co2 || 0) + '</p><p>évités grâce à vos ' + (imp.articles || 0) + ' achat' + ((imp.articles || 0) > 1 ? 's' : '') + ' de seconde main, et ' + kg(imp.kg || 0) + ' sauvés de la benne.</p>' +
        '<span class="impact-lien">Voir mon bilan ' + ICONES.chevron + '</span></button>';
    }
    html += '<nav class="menu">' + menu.map(function (m) {
      return '<button data-menu="' + m[0] + '"' + (m[4] ? ' class="' + m[4] + '"' : '') + '>' + m[1] + '<span>' + esc(m[2]) + '</span>' + (m[3] ? '<em>' + esc(m[3]) + '</em>' : '') + ICONES.chevron + '</button>';
    }).join('') + '<button data-menu="conf">' + ICONES.etoile + '<span>Politique de confidentialité</span>' + ICONES.chevron + '</button></nav>';
    $vue.innerHTML = html;
    var cx = document.getElementById('cx'); if (cx) cx.onclick = function () { aller('connexion', {}); };
    var vb = document.getElementById('vers-bilan'); if (vb) vb.onclick = function () { aller('bilan'); };
    $vue.querySelector('.menu').onclick = function (e) {
      var b = e.target.closest('[data-menu]'); if (!b) return;
      var m = b.dataset.menu;
      if (m === 'conf') return ouvrirLien(c.urlConfidentialite);
      if (m === 'favoris' || m === 'apropos' || m === 'inviter' || m === 'retour') return aller(m);
      var noms = { alertes: 'créer des alertes', don: 'proposer un don', mesDons: 'voir vos dons', bilan: 'voir votre bilan', mesTailles: 'enregistrer vos tailles', reglages: 'gérer votre compte' };
      if (exigerConnexion('Connectez-vous pour ' + noms[m] + '.', function () { aller(m, {}, true); })) aller(m);
    };
    if (etat.jeton) {
      if (etat.moiLe && Date.now() - etat.moiLe < 60000) return;
      api('moi').then(function (u2) { etat.moiLe = Date.now(); var avant = JSON.stringify(etat.utilisateur); etat.utilisateur = u2; if (avant !== JSON.stringify(u2) && etat.pile[etat.pile.length - 1].nom === 'compte') vues.compte(); }).catch(function () {});
    }
  };

  // ================= Paramètres du compte =================
  vues.reglages = function () {
    var u = etat.utilisateur || {};
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">Paramètres du compte</h1>' +
      '<section class="encadre"><h3>Mes informations</h3><p>' + esc(u.prenom || '') + (u.nom ? ' ' + esc(u.nom) : '') + '</p><p>' + esc(u.email || '') + '</p>' + (u.telephone ? '<p>' + esc(u.telephone) + '</p>' : '') + '</section>' +
      (!NATIF && /iPhone|iPad|iPod/.test(navigator.userAgent) && !estInstallee() && (window.BSBP_CONFIG || {}).firebase ? '<section class="encadre"><h3>Notifications sur iPhone</h3><p>Ajoutez d\'abord l\'app à l\'écran d\'accueil (Partager › Sur l\'écran d\'accueil), ouvrez-la depuis son icône, puis revenez ici pour activer les notifications.</p></section>' : '') +
      (Push.disponible() ? '<section class="reglage"><div><b>Notifications sur ce téléphone</b><span>Nouveautés de vos alertes, article libéré pour vous, réponses de l\'équipe.</span></div>' +
        '<label class="interrupteur"><input type="checkbox" id="push"' + (etat.pushActif ? ' checked' : '') + '><span aria-hidden="true"></span><em class="sr">Notifications</em></label></section>' : '') +
      '<nav class="menu" style="margin-top:16px"><button data-r="profil">' + ICONES.coeur + '<span>Mon profil</span>' + ICONES.chevron + '</button><button data-r="tailles">' + ICONES.etoile + '<span>Mes tailles</span>' + ICONES.chevron + '</button></nav>' +
      '<div class="pile" style="margin-top:24px"><button class="bouton second" id="deco">Se déconnecter</button></div>' +
      '<section class="zone-sensible"><h3>Supprimer mon compte</h3><p>Efface vos informations, alertes, messages et listes d\'attente, et annule vos réservations en cours.</p>' +
      '<button class="lien danger-lien" id="suppr">Supprimer mon compte…</button></section>';
    var pu = document.getElementById('push');
    if (pu) pu.onchange = function () {
      if (pu.checked) Push.activer(true).then(function (ok) { pu.checked = ok; if (ok) toast('Notifications activées.'); else toast('Autorisez les notifications dans les réglages du téléphone.', true); });
      else Push.desactiver().then(function () { toast('Notifications désactivées.'); });
    };
    $vue.querySelector('[data-r="tailles"]').onclick = function () { aller('mesTailles'); };
    $vue.querySelector('[data-r="profil"]').onclick = function () { aller('profil', {}); };
    document.getElementById('deco').onclick = function () {
      modale('Se déconnecter ?', 'Vous devrez recevoir un nouveau code par mail pour vous reconnecter sur ce téléphone.', [
        { texte: 'Se déconnecter', valeur: true }, { texte: 'Rester connecté', valeur: false, style: 'second' }
      ]).then(function (ok) { if (!ok) return; Push.oublier(); api('deconnexion').catch(function () {}); deconnecterLocalement(); ouvrirOnglet('catalogue'); toast('Vous êtes déconnecté.'); });
    };
    document.getElementById('suppr').onclick = function () {
      modale('Supprimer votre compte ?', 'Vos informations, alertes, messages et listes d\'attente seront effacés et vos réservations en cours annulées. Cette action est définitive.', [
        { texte: 'Supprimer définitivement', valeur: true, style: 'danger' }, { texte: 'Garder mon compte', valeur: false, style: 'second' }
      ]).then(function (ok) {
        if (!ok) return;
        api('supprimerCompte').then(function () { Push.oublier(true); deconnecterLocalement(); etat.articles = null; ouvrirOnglet('catalogue'); toast('Votre compte a été supprimé.'); }).catch(erreur);
      });
    };
  };

  // ================= Mon bilan d'impact =================
  vues.bilan = function () {
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">Mon bilan</h1><div id="bilan"><div class="squelette" style="aspect-ratio:2/1"></div></div>';
    api('monBilan').then(function (b) {
      var z = document.getElementById('bilan'); if (!z) return;
      var t = b.totaux, eq = b.equivalences || cfg().equivalences || {};
      if (!t.articles) {
        z.innerHTML = '<div class="vide"><strong>Votre bilan démarre au premier retrait</strong>Chaque article d\'occasion que vous retirez s\'ajoute ici : CO₂ évité, kilos sauvés de la benne, historique.<button class="bouton" id="cat">Voir le catalogue</button></div>';
        document.getElementById('cat').onclick = function () { ouvrirOnglet('catalogue'); };
        return;
      }
      var km = eq.voitureKgParKm ? Math.round(t.co2 / eq.voitureKgParKm) : 0;
      var jours = eq.empreinteFrancaisKg ? Math.round(t.co2 / (eq.empreinteFrancaisKg / 365) * 10) / 10 : 0;
      var maxMois = Math.max.apply(null, b.mois.map(function (m) { return m.co2; }).concat([1]));
      var maxCat = Math.max.apply(null, b.parCategorie.map(function (c) { return c.co2; }).concat([1]));
      var MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
      z.innerHTML =
        '<section class="bilan-hero"><p class="bilan-label">CO₂ évité</p><p class="bilan-chiffre">' + co2(t.co2) + '</p>' +
          (km ? '<p class="bilan-equiv">Autant que <b>' + km.toLocaleString('fr-FR') + ' km</b> en voiture' + (jours >= 1 ? ', ou <b>' + String(jours).replace('.', ',') + ' jours</b> d\'empreinte carbone d\'un Français' : '') + '.</p>' : '') + '</section>' +
        '<div class="tuiles"><div><b>' + t.articles + '</b><span>article' + (t.articles > 1 ? 's' : '') + ' réemployé' + (t.articles > 1 ? 's' : '') + '</span></div>' +
          '<div><b>' + kg(t.kg) + '</b><span>sauvés de la benne</span></div><div><b>' + prix(t.depense) + '</b><span>dépensés en seconde main</span></div></div>' +
        '<h2 class="section">Sur 12 mois</h2><div class="histo" role="img" aria-label="CO₂ évité par mois">' + b.mois.map(function (m) {
          var h = Math.round(m.co2 / maxMois * 100);
          return '<div><i style="height:' + Math.max(h, m.co2 ? 4 : 0) + '%" title="' + esc(co2(m.co2)) + '"></i><span>' + MOIS_C[Number(m.mois.slice(5)) - 1].slice(0, 1).toUpperCase() + '</span></div>';
        }).join('') + '</div>' +
        '<h2 class="section">Par catégorie</h2>' + b.parCategorie.map(function (c) {
          return '<div class="barre-cat"><div><b>' + esc(c.categorie) + '</b><span>' + c.articles + ' article' + (c.articles > 1 ? 's' : '') + ', ' + co2(c.co2) + '</span></div><i><em style="width:' + Math.max(4, Math.round(c.co2 / maxCat * 100)) + '%"></em></i></div>';
        }).join('') +
        '<h2 class="section">Mes retraits</h2>' + b.retraits.map(function (r) {
          return '<div class="ligne-article"><div class="vignette">' + imgPhoto(r.photo, '', 200) + '</div><div><h3>' + esc(r.titre) + '</h3><p>' + esc(dateLongue(r.date)) + ', ' + prix(r.prix) + '</p></div>' +
            '<span class="mini-co2">' + (r.co2 ? '−' + co2(r.co2) : kg(r.kg)) + '</span></div>';
        }).join('') +
        '<div class="pile" style="margin-top:22px"><button class="bouton" id="partager-bilan">' + ICONES.partage + 'Partager mon bilan</button><button class="bouton second" id="inviter">Inviter un proche</button></div>' +
        '<p class="methode">Estimation : pour chaque article, on compte l\'empreinte de fabrication d\'un article neuf équivalent (données ADEME, Impact CO2), en considérant que votre achat d\'occasion évite un achat neuf' +
          (b.tauxSubstitution < 1 ? ' dans ' + Math.round(b.tauxSubstitution * 100) + ' % des cas' : '') + '. Sans équivalent connu, seul le poids compte. ' +
          '<button class="lien" id="source">Voir les données ADEME</button></p>';
      document.getElementById('inviter').onclick = function () { aller('inviter'); };
      document.getElementById('source').onclick = function () { ouvrirLien('https://impactco2.fr/outils/habillement'); };
      document.getElementById('partager-bilan').onclick = function () {
        var c = cfg();
        partagerTexte('Mon bilan Bailleul Super Bon Plan', 'Grâce à mes achats d\'occasion sur Bailleul Super Bon Plan, j\'ai évité ' + co2(t.co2) + ' (autant que ' + km + ' km en voiture) et sauvé ' + kg(t.kg) + ' de la benne ! Télécharge l\'appli :', c.lienTelechargement);
      };
    }).catch(erreur);
  };

  // ================= Inviter un proche =================
  vues.inviter = function () {
    var c = cfg();
    var lien = c.lienTelechargement || '';
    var msg = (c.messageInvitation || 'Télécharge l\'appli Bailleul Super Bon Plan :') + ' ' + lien;
    var ios = Cap && Cap.getPlatform && Cap.getPlatform() === 'ios';
    var canaux = [
      ['sms', 'SMS', ICONES.bulle, (ios ? 'sms:&body=' : 'sms:?body=') + encodeURIComponent(msg)],
      ['whatsapp', 'WhatsApp', ICONES.telephone, 'https://wa.me/?text=' + encodeURIComponent(msg)],
      ['mail', 'E-mail', ICONES.enveloppe, 'mailto:?subject=' + encodeURIComponent('Une appli de bons plans à Bailleul') + '&body=' + encodeURIComponent(msg)],
      ['facebook', 'Facebook', ICONES.monde, 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(lien)]
    ];
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">Inviter un proche</h1>' +
      '<p class="sous-titre">Envoyez le lien de téléchargement de l\'appli en un geste.</p>' +
      '<div class="canaux">' + canaux.map(function (k) {
        return '<button class="canal canal-' + k[0] + '" data-url="' + esc(k[3]) + '">' + k[2] + '<span>' + k[1] + '</span></button>';
      }).join('') + '</div>' +
      '<div class="pile" style="margin-top:12px"><button class="bouton second" id="autres">' + ICONES.partage + 'Autres applications</button>' +
      '<button class="bouton second" id="copier">Copier le lien</button></div>' +
      '<section class="qr-carte"><div id="qr" aria-label="QR code du lien de téléchargement" role="img"></div><div><h3>Ou faites-le scanner</h3><p>Votre proche vise ce code avec l\'appareil photo de son téléphone.</p></div></section>' +
      '<section class="encadre"><h3>Le message envoyé</h3><p>' + esc(msg) + '</p></section>';
    try {
      var qr = qrcode(0, 'M'); qr.addData(lien); qr.make();
      document.getElementById('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch (e) { document.getElementById('qr').hidden = true; }
    $vue.querySelector('.canaux').onclick = function (e) { var b = e.target.closest('[data-url]'); if (b) ouvrirExterne(b.dataset.url); };
    document.getElementById('autres').onclick = function () { partagerTexte('Bailleul Super Bon Plan', c.messageInvitation || '', lien); };
    document.getElementById('copier').onclick = function () { copier(lien).then(function () { toast('Lien copié. Collez-le où vous voulez.'); }); };
  };
  function ouvrirExterne(url) {
    if (NATIF) { window.location.href = url; return; }
    if (/^https?:/.test(url)) window.open(url, '_blank', 'noopener'); else window.location.href = url;
  }
  function copier(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(function () { return copieSecours(t); });
    return Promise.resolve(copieSecours(t));
  }
  function copieSecours(t) { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); }
  function partagerTexte(titre, texte, url) {
    var d = { title: titre, text: texte, url: url || undefined, dialogTitle: titre };
    if (Plugins.Share) return Plugins.Share.share(d).catch(function () {});
    if (navigator.share) return navigator.share(d).catch(function () {});
    return copier(texte + (url ? ' ' + url : '')).then(function () { toast('Texte copié. Collez-le dans votre message.'); });
  }

  // ================= Notifications sur le téléphone (Firebase Cloud Messaging) =================
  /** Notifications de la version web (Android, et iPhone quand l'app est ajoutée à l'écran d'accueil). Même interface que le plugin natif. */
  var WebFM = (function () {
    var conf = (window.BSBP_CONFIG || {}).firebase;
    var ok = !NATIF && !!(conf && conf.vapidKey && conf.apiKey) && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    var VERSION_FB = '12.4.0', messaging = null, chargement = null;
    function script(src) { return new Promise(function (res, rej) { var s0 = document.createElement('script'); s0.src = src; s0.onload = res; s0.onerror = rej; document.head.appendChild(s0); }); }
    function charger() {
      if (!chargement) chargement = script('https://www.gstatic.com/firebasejs/' + VERSION_FB + '/firebase-app-compat.js')
        .then(function () { return script('https://www.gstatic.com/firebasejs/' + VERSION_FB + '/firebase-messaging-compat.js'); })
        .then(function () { if (!window.firebase.apps.length) window.firebase.initializeApp(conf); messaging = window.firebase.messaging(); return messaging; });
      return chargement;
    }
    function etatPermission() { return { receive: Notification.permission === 'default' ? 'prompt' : Notification.permission }; }
    return !ok ? null : {
      checkPermissions: function () { return Promise.resolve(etatPermission()); },
      requestPermissions: function () { return Notification.requestPermission().then(function () { return etatPermission(); }); },
      getToken: function () {
        return charger().then(function () { return navigator.serviceWorker.ready; })
          .then(function (reg) { return messaging.getToken({ vapidKey: conf.vapidKey, serviceWorkerRegistration: reg }); })
          .then(function (t) { return { token: t }; });
      },
      deleteToken: function () { return charger().then(function () { return messaging.deleteToken(); }); },
      addListener: function (nom, cb) {
        if (nom === 'notificationReceived') charger().then(function () {
          messaging.onMessage(function (pl) { var n = pl.notification || {}; cb({ notification: { title: n.title, body: n.body, data: pl.data || {} } }); });
        }).catch(function () {});
        if (nom === 'notificationActionPerformed') navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.ouvrir) cb({ notification: { data: e.data.ouvrir } }); });
      }
    };
  })();

  var Push = (function () {
    function FM() { return NATIF ? Plugins.FirebaseMessaging : WebFM; }
    function disponible() { return !!(FM() && cfg().notificationsPush) || MODE_DEMO; }
    function enregistrer() {
      if (MODE_DEMO) { etat.pushActif = true; return Promise.resolve(true); }
      return FM().getToken().then(function (r) {
        if (!r || !r.token) return false;
        return stockage.set('pushToken', r.token).then(function () {
          return api('enregistrerAppareil', { token: r.token, plateforme: NATIF ? Cap.getPlatform() : 'web' });
        }).then(function () { etat.pushActif = true; return true; });
      }).catch(function () { return false; });
    }
    function activer(demander) {
      if (!disponible() || !etat.jeton) return Promise.resolve(false);
      if (MODE_DEMO) return stockage.set('pushDemo', '1').then(enregistrer);
      return FM().checkPermissions().then(function (p) {
        if (p.receive === 'granted') return enregistrer();
        if (!demander || p.receive === 'denied') return false;
        return FM().requestPermissions().then(function (p2) { return p2.receive === 'granted' ? enregistrer() : false; });
      }).catch(function () { return false; });
    }
    function desactiver() {
      etat.pushActif = false;
      if (MODE_DEMO) return stockage.set('pushDemo', null);
      return oublier();
    }
    function oublier(sansApi) {
      etat.pushActif = false;
      if (!FM()) return Promise.resolve();
      return stockage.get('pushToken').then(function (t) {
        if (t && !sansApi) api('oublierAppareil', { token: t }).catch(function () {});
        stockage.set('pushToken', null);
        return FM().deleteToken().catch(function () {});
      });
    }
    /** Proposé au bon moment (après une alerte ou une liste d'attente), une seule fois. */
    function proposer(raison) {
      if (!disponible() || etat.pushActif) return;
      stockage.get('pushPropose').then(function (deja) {
        if (deja) return;
        stockage.set('pushPropose', '1');
        modale('Être prévenu sur votre téléphone ?', esc(raison) + ' Vous recevrez aussi un mail, et vous pourrez couper les notifications dans votre compte.', [
          { texte: 'Activer les notifications', valeur: true }, { texte: 'Plus tard', valeur: false, style: 'second' }
        ]).then(function (ok) { if (ok) activer(true).then(function (r) { if (r) toast('Notifications activées.'); }); });
      });
    }
    function ouvrir(data) {
      if (!data) return;
      data = data || {};
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = {}; } }
      if (data.type === 'offre' || data.type === 'location') return ouvrirOnglet('reservations');
      if (data.type === 'message') { ouvrirOnglet('messages'); return aller('conversation', { id: data.id }); }
      if (data.type === 'message-equipe') { ouvrirOnglet('eq-messages'); return aller('conversation', { id: data.id, equipe: true }); }
      if (data.type === 'don') { ouvrirOnglet('compte'); return aller('mesDons'); }
      if (data.idArticle) {
        etat.articles = null;
        return chargerArticles().then(function () { ouvrirOnglet('catalogue'); if (trouverArticle(data.idArticle)) aller('article', { id: data.idArticle }); }).catch(function () { ouvrirOnglet('catalogue'); });
      }
    }
    function brancher() {
      if (!FM()) return;
      FM().addListener('notificationReceived', function (ev) {
        var n = ev.notification || {};
        banniere(n.title, n.body, n.data);
        if (etat.rafraichirConversation && etat.relancerConv) { etat.relancerConv(); etat.rafraichirConversation(); }
        delete memoire['mesConversations{}']; delete memoire['equipeConversations{}']; delete memoire['mesResas{}'];
        rafraichirMesAttentes().catch(function () {});
        rafraichirNonLus();
        var c = etat.pile[etat.pile.length - 1];
        if (c && c.nom === 'conversation' && n.data && n.data.id === c.params.id && etat.rafraichirConversation) etat.rafraichirConversation();
      });
      FM().addListener('notificationActionPerformed', function (ev) { ouvrir((ev.notification || {}).data); });
      if (!NATIF) return;
      FM().addListener('tokenReceived', function (ev) {
        if (etat.jeton && etat.pushActif && ev.token) { stockage.set('pushToken', ev.token); api('enregistrerAppareil', { token: ev.token, plateforme: Cap.getPlatform() }).catch(function () {}); }
      });
    }
    /** Bandeau façon notification, quand l'app est ouverte (et en démo). */
    function banniere(titre, corps, data) {
      if (etat.rafraichirConversation && etat.relancerConv) { etat.relancerConv(); setTimeout(function () { if (etat.rafraichirConversation) etat.rafraichirConversation(); }, 300); }
      var b = document.getElementById('banniere-push');
      if (!b) { b = document.createElement('button'); b.id = 'banniere-push'; document.body.appendChild(b); }
      b.innerHTML = '<span class="bp-icone">€</span><span><b>' + esc(titre || '') + '</b>' + esc(corps || '') + '</span>';
      b.className = 'visible';
      b.onclick = function () { b.className = ''; ouvrir(data); };
      clearTimeout(banniere._t); banniere._t = setTimeout(function () { b.className = ''; }, 6000);
    }
    return { ouvrir: ouvrir, disponible: disponible, activer: activer, desactiver: desactiver, oublier: oublier, proposer: proposer, brancher: brancher, banniere: banniere };
  })();
  window.BSBP_BANNIERE = function (t, c, d) { if (etat.pushActif || MODE_DEMO) { Push.banniere(t, c, d); rafraichirNonLus(); } };

  function deconnecterLocalement() {
    etat.modeClient = false;
    etat.jeton = ''; etat.utilisateur = null; etat.alertes = []; etat.mesAttentes = []; etat.pushActif = false;
    stockage.set('jeton', null); majPastille();
    if (etat.onglet === 'equipe') ouvrirOnglet('catalogue');
  }

  vues.apropos = function () {
    var c = cfg();
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">Qui sommes-nous ?</h1>' +
      '<section class="encadre vert"><h3>' + esc(c.nomEbe || '') + '</h3><p>' + esc(c.presentation || '') + '</p></section>' +
      (c.impact && c.impact.articles ? '<section class="impact-carte"><p class="impact-chiffre">' + kg(c.impact.kg) + '</p><p>réemployés grâce à ' + c.impact.articles + ' achats dans l\'application.</p></section>' : '') +
      '<section class="encadre"><h3>Point de retrait</h3><p>' + esc(c.point && c.point.nom) + '</p><p>' + esc(c.point && c.point.adresse) + '</p><p>' + esc(c.point && c.point.horaires) + '</p>' +
      (c.telephone ? '<p>Tél. <a href="tel:' + esc(String(c.telephone).replace(/\s/g, '')) + '">' + esc(c.telephone) + '</a></p>' : '') +
      (c.emailContact ? '<p><a href="mailto:' + esc(c.emailContact) + '">' + esc(c.emailContact) + '</a></p>' : '') + '</section>';
  };

  // ================= Favoris =================
  vues.favoris = function () {
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">Mes favoris</h1><p class="sous-titre">Gardés sur ce téléphone. Un favori ne bloque pas l\'article : réservez-le pour le mettre de côté.</p><div id="liste"></div>';
    var zone = document.getElementById('liste');
    brancherCartes(zone);
    (etat.articles ? Promise.resolve(etat.articles) : chargerArticles()).then(function (tous) {
      var liste = etat.favoris.map(function (id) { return tous.filter(function (a) { return a.id === id; })[0]; }).filter(Boolean);
      zone.innerHTML = liste.length ? '<div class="grille">' + liste.map(carte).join('') + '</div>'
        : '<div class="vide"><strong>Aucun favori</strong>Touchez le cœur d\'un article pour le retrouver ici. Les articles vendus disparaissent de la liste.</div>';
    }).catch(erreur);
  };

  // ================= Alertes =================
  vues.alertes = function (p) {
    var c = cfg(), pre = (p && p.prerempli) || {};
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">Mes alertes</h1>' +
      '<p class="sous-titre">Soyez prévenu (mail et notification) dès qu\'un article correspondant est mis en ligne, avant tout le monde.</p><div id="mes-alertes"></div>' +
      '<h2 class="section">Nouvelle alerte</h2><form class="pile" id="fa">' +
      '<label class="champ">Je cherche <small>(mots-clés)</small><input name="motsCles" maxlength="80" placeholder="Ex. manteau laine, table ronde" value="' + esc(pre.motsCles || '') + '"></label>' +
      '<label class="champ">Catégorie<select name="categorie"><option value="">Toutes</option>' + (c.categories || []).map(function (x) { return '<option' + (x === pre.categorie ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></label>' +
      '<label class="champ">Sous-catégorie<select name="sousCategorie"></select></label>' +
      '<div class="rangee"><div id="champ-taille-alerte"></div>' +
      '<label class="champ">Prix max <small>(€)</small><input name="prixMax" inputmode="decimal" placeholder="20"></label></div>' +
      '<label class="case"><input type="checkbox" name="proches" value="1"><span>Inclure aussi les articles proches (par exemple un fauteuil pour une alerte « canapé »)</span></label>' +
      '<p class="meta">Pour ne pas vous submerger, les nouveautés sont regroupées : au plus un message par demi-journée.</p>' +
      '<button class="bouton">Créer l\'alerte</button></form>';
    function dessiner() {
      var z = document.getElementById('mes-alertes'); if (!z) return;
      z.innerHTML = etat.alertes.length ? etat.alertes.map(function (al) {
        return '<div class="ligne-alerte' + (al.active ? '' : ' inactive') + '">' + ICONES.cloche + '<div><b>' + esc(resumeAlerte(al)) + '</b>' +
          (al.active ? (al.nbEnvois ? '<span>' + al.nbEnvois + ' envoi' + (al.nbEnvois > 1 ? 's' : '') + '</span>' : '') : '<span>Désactivée depuis un mail</span>') +
          '</div><button class="lien" data-suppr="' + esc(al.id) + '">Supprimer</button></div>';
      }).join('') : '<p class="meta">Aucune alerte pour l\'instant.</p>';
    }
    dessiner();
    var fa = document.getElementById('fa');
    function majSousCat() {
      var scs = sousCats(fa.categorie.value);
      fa.sousCategorie.innerHTML = '<option value="">Toutes</option>' + scs.map(function (x) { return '<option' + (x.nom === pre.sousCategorie ? ' selected' : '') + '>' + esc(x.nom) + '</option>'; }).join('');
      fa.sousCategorie.closest('label').hidden = !scs.length;
      majTaille();
    }
    function majTaille() {
      var g = grilleDe(fa.categorie.value, fa.sousCategorie.value), gr = g && ref().grilles[g];
      document.getElementById('champ-taille-alerte').innerHTML = gr && gr.type === 'liste'
        ? '<label class="champ">Taille<select name="taille"><option value="">Toutes</option>' + gr.valeurs.map(function (v) { return '<option' + (v === pre.taille ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') + '</select></label>'
        : '<label class="champ">Taille <small>(facultatif)</small><input name="taille" maxlength="20" placeholder="M, 40, 6 ans…" value="' + esc(pre.taille || '') + '"></label>';
    }
    fa.categorie.addEventListener('change', function () { pre.sousCategorie = ''; majSousCat(); });
    fa.sousCategorie.addEventListener('change', majTaille);
    majSousCat();
    api('mesAlertes').then(function (l) { etat.alertes = l; dessiner(); }).catch(function () {});
    document.getElementById('mes-alertes').onclick = function (e) {
      var b = e.target.closest('[data-suppr]'); if (!b) return;
      chargement(b, true);
      api('supprimerAlerte', { id: b.dataset.suppr }).then(function () { etat.alertes = etat.alertes.filter(function (x) { return x.id !== b.dataset.suppr; }); dessiner(); toast('Alerte supprimée.'); }).catch(function (err) { chargement(b, false); erreur(err); });
    };
    document.getElementById('fa').onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, btn = f.querySelector('.bouton');
      var d = Object.fromEntries(new FormData(f)); d.proches = !!d.proches;
      chargement(btn, true);
      api('creerAlerte', { alerte: d }).then(function (al) {
        if (!etat.alertes.some(function (x) { return x.id === al.id; })) etat.alertes.push(al); f.reset(); chargement(btn, false); dessiner();
        var deja = (etat.articles || []).filter(function (a) { return a.disponible && correspond(al, a); }).length;
        toast(deja ? 'Alerte créée. ' + deja + ' article' + (deja > 1 ? 's correspondent' : ' correspond') + ' déjà !' : 'Alerte créée. Vous serez prévenu dès qu\'un article arrive.');
        Push.proposer('Les pièces partent vite : soyez prévenu dès qu\'un article correspondant arrive.');
      }).catch(function (err) { chargement(btn, false); erreur(err); });
    };
  };

  // ================= Dons =================
  vues.don = function (p) {
    var c = cfg(), u = etat.utilisateur || {}, ex = p && p.don;
    var b = ex ? { photos: ex.photos.slice() } : etat.brouillonDon;
    var modes = (c.dons && c.dons.modes) || [];
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">' + (ex ? 'Modifier ma proposition' : 'Donner un objet') + '</h1>' +
      '<p class="sous-titre">' + esc((c.dons && c.dons.texte) || '') + '</p>' +
      '<form class="pile" id="fd">' +
      '<div><p class="champ" style="margin:0 0 6px">Photos <small>(facultatif, 2 maximum)</small></p><div class="photos-saisie" id="ph"></div></div>' +
      '<label class="champ">Catégorie<select name="categorie">' + (c.categories || []).map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '<option>Autre</option></select></label>' +
      '<label class="champ">Qu\'aimeriez-vous donner ?<textarea name="description" required maxlength="800" placeholder="Ex. un sac de vêtements enfants 4-6 ans, une commode en pin"></textarea></label>' +
      (modes.length ? '<label class="champ">Remise<select name="mode" id="mode">' + modes.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select></label>' : '') +
      '<label class="champ" id="champ-adresse" hidden>Adresse ou commune<input name="adresse" maxlength="200" autocomplete="street-address"></label>' +
      '<label class="champ">Téléphone <small>(pour convenir d\'un rendez-vous)</small><input name="telephone" type="tel" autocomplete="tel" value="' + esc(u.telephone || '') + '"></label>' +
      '<button class="bouton">' + (ex ? 'Enregistrer les modifications' : 'Proposer mon don') + '</button></form>';
    var fd = document.getElementById('fd');
    if (ex) { fd.description.value = ex.description; if (ex.categorie) fd.categorie.value = ex.categorie; if (fd.mode && ex.mode) fd.mode.value = ex.mode; fd.adresse.value = ex.adresse || ''; }
    var mode = document.getElementById('mode');
    function majAdresse() { document.getElementById('champ-adresse').hidden = !(mode && /domicile|collecte à/i.test(mode.value)); }
    if (mode) { mode.onchange = majAdresse; majAdresse(); }
    var dessinerPh = brancherPhotos(document.getElementById('ph'), b.photos, 2);
    dessinerPh();
    document.getElementById('fd').onsubmit = function (e) {
      e.preventDefault();
      var btn = e.target.querySelector('.bouton'); chargement(btn, true, b.photos.length ? 'Envoi des photos…' : 'Envoi…');
      if (ex) {
        return api('modifierDon', { id: ex.id, don: Object.fromEntries(new FormData(e.target)), photos: b.photos }).then(function () { toast('Proposition modifiée.'); retour(); })
          .catch(function (err) { chargement(btn, false); erreur(err); });
      }
      api('proposerDon', { don: Object.fromEntries(new FormData(e.target)), photos: b.photos }).then(function () {
        etat.brouillonDon = { photos: [] };
        modale('Merci pour votre don !', 'L\'équipe regarde votre proposition et vous répond par mail. Vous suivez la réponse dans Compte › Mes propositions de dons.', [{ texte: 'Parfait', valeur: true }])
          .then(function () { aller('mesDons', {}, true); });
      }).catch(function (err) { chargement(btn, false); erreur(err); });
    };
  };
  vues.mesDons = function () {
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">Mes propositions de dons</h1><div id="liste"><p class="sous-titre">Chargement…</p></div>';
    api('mesDons').then(function (l) {
      var z = document.getElementById('liste'); if (!z) return;
      var lib = { 'nouveau': ['En attente de réponse', 'ok'], 'accepté': ['Accepté', 'ok'], 'refusé': ['Non retenu', 'fini'], 'reçu': ['Reçu, merci !', 'ok'], 'annulé': ['Retiré', 'fini'] };
      z.innerHTML = l.length ? l.map(function (d) {
        var s = lib[d.statut] || [d.statut, 'fini'];
        return '<div class="resa">' + vignette({ photos: d.photos, titre: d.description }) + '<div><h3>' + esc(d.description.slice(0, 80)) + '</h3><p class="meta">' + esc(dateLongue(d.date)) + ', ' + esc(d.mode) + '</p>' +
          '<span class="etiquette ' + s[1] + '">' + esc(s[0]) + '</span>' + (d.reponse ? '<p class="reponse">« ' + esc(d.reponse) + ' »</p>' : '') + '</div>' +
          '<div class="actions">' + (d.statut === 'nouveau' ? '<button class="bouton second petit" data-modif-don="' + esc(d.id) + '">Modifier</button>' : '') +
          (d.statut === 'nouveau' || d.statut === 'accepté' ? '<button class="bouton second petit" data-retirer-don="' + esc(d.id) + '">Retirer ma proposition</button>' : '') + '</div></div>';
      }).join('') : '<div class="vide"><strong>Aucune proposition</strong>Vos dons donnent du travail à l\'équipe et une seconde vie aux objets.</div>';
      z.onclick = function (e) {
        var m = e.target.closest('[data-modif-don]'); if (m) { aller('don', { don: l.filter(function (d) { return d.id === m.dataset.modifDon; })[0] }); return; }
        var r = e.target.closest('[data-retirer-don]'); if (!r) return;
        modale('Retirer cette proposition ?', 'L\'équipe en sera informée.', [{ texte: 'Retirer', valeur: true, style: 'danger' }, { texte: 'Garder', valeur: false, style: 'second' }])
          .then(function (ok) { if (ok) api('annulerDon', { id: r.dataset.retirerDon }).then(function () { toast('Proposition retirée.'); vues.mesDons(); }).catch(erreur); });
      };
    }).catch(erreur);
  };

  // ================= Photos (équipe et dons) =================
  function brancherPhotos(ph, liste, max) {
    function dessiner() {
      ph.innerHTML = liste.map(function (src, i) { return '<div><img src="' + esc(/^data:/.test(src) ? src : urlPhoto(src, 300)) + '" alt="Photo ' + (i + 1) + '"><button type="button" class="suppr" data-i="' + i + '" aria-label="Retirer la photo">×</button></div>'; }).join('') +
        (liste.length < max ? '<div><button type="button" class="ajout">' + ICONES.photo + 'Ajouter</button></div>' : '');
    }
    ph.onclick = function (e) {
      var s = e.target.closest('.suppr'); if (s) { liste.splice(Number(s.dataset.i), 1); dessiner(); return; }
      if (e.target.closest('.ajout')) prendrePhoto().then(function (d) { if (d) { liste.push(d); dessiner(); } }).catch(erreur);
    };
    return dessiner;
  }
  function prendrePhoto() {
    if (NATIF && Plugins.Camera) {
      return Plugins.Camera.getPhoto({
        quality: 80, width: 1400, resultType: 'dataUrl', source: 'PROMPT', correctOrientation: true,
        promptLabelHeader: 'Photo', promptLabelPhoto: 'Choisir dans la galerie', promptLabelPicture: 'Prendre une photo', promptLabelCancel: 'Annuler'
      }).then(function (p) { return reduire(p.dataUrl); }).catch(function (e) { if (/cancel/i.test(String(e && e.message))) return null; throw e; });
    }
    return new Promise(function (resoudre) {
      var inp = document.getElementById('fichier-photo');
      inp.value = '';
      inp.onchange = function () {
        var f = inp.files[0]; if (!f) return resoudre(null);
        var r = new FileReader(); r.onload = function () { reduire(r.result).then(resoudre); }; r.readAsDataURL(f);
      };
      inp.click();
    });
  }
  function reduire(dataUrl) {
    return new Promise(function (resoudre) {
      var img = new Image();
      img.onload = function () {
        var max = 1400, w = img.width, h = img.height, k = Math.min(1, max / Math.max(w, h));
        var cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        resoudre(cv.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = function () { resoudre(dataUrl); };
      img.src = dataUrl;
    });
  }

  // ================= Espace équipe =================
  var TITRES_EQUIPE = { accueil: 'Tableau de bord', retraits: 'Retraits à préparer', locations: 'Locations', messages: 'Messages des clients', stock: 'Stock', plus: 'Plus',
    ajouter: 'Mettre un article en ligne', materiel: 'Matériel en location', dons: 'Propositions de dons', animer: 'Animations', reglages: 'Réglages' };
  vues.equipe = function () {
    if (!etat.utilisateur || !etat.utilisateur.role) { ouvrirOnglet('catalogue'); return; }
    var v = etat.equipeVue;
    if (modeEquipe()) {
      $vue.innerHTML = '<header class="tete-equipe"><p>Espace équipe</p><h1 class="titre-page">' + esc(TITRES_EQUIPE[v] || '') + '</h1></header><div id="eq"></div>';
      if (['ajouter', 'materiel', 'dons', 'animer', 'reglages'].indexOf(v) >= 0) $vue.insertAdjacentHTML('afterbegin', '<button class="retour" data-v-retour>' + ICONES.retour + 'Plus</button>');
      var rb = $vue.querySelector('[data-v-retour]'); if (rb) rb.onclick = function () { etat.equipeVue = 'plus'; vues.equipe(); };
      ({ accueil: equipeTableau, plus: equipePlus, stock: equipeStockOnglets, locations: equipeLocationsUI, materiel: equipeMaterielUI, reglages: equipeReglages, retraits: equipeRetraits, messages: equipeMessages, ajouter: equipeAjouter, dons: equipeDons, animer: equipeAnimer })[v](document.getElementById('eq'));
      return;
    }
    $vue.innerHTML = '<h1 class="titre-page">Espace équipe</h1>' +
      '<div class="liens-equipe">' + (etat.utilisateur.urlSuivi ? '<button class="lien lien-suivi" id="suivi">' + ICONES.feuille + ' Tableau de suivi (Google Sheet)</button>' : '') +
      '<button class="lien lien-suivi" id="bug">' + ICONES.bulle + ' Signaler un bug ou une idée</button></div>' +
      '<div class="puces" role="group" aria-label="Rubrique">' +
      [['retraits', 'Retraits'], ['locations', 'Locations'], ['messages', 'Messages'], ['ajouter', 'Ajouter'], ['stock', 'Articles'], ['materiel', 'Matériel'], ['dons', 'Dons'], ['animer', 'Animer'], ['reglages', 'Réglages']]
        .filter(function (s) { return (s[0] !== 'locations' && s[0] !== 'materiel') || (cfg().location && cfg().location.active); }).map(function (s) {
        return '<button class="puce" data-v="' + s[0] + '" aria-pressed="' + (v === s[0]) + '">' + s[1] + (s[0] === 'messages' && etat.nonLusEquipe ? ' <em class="compteur">' + etat.nonLusEquipe + '</em>' : '') + '</button>';
      }).join('') + '</div><div id="eq"></div>';
    $vue.querySelector('.puces').onclick = function (e) { var b = e.target.closest('button'); if (b) { etat.equipeVue = b.dataset.v; vues.equipe(); } };
    var su = document.getElementById('suivi'); if (su) su.onclick = function () { ouvrirLien(etat.utilisateur.urlSuivi); };
    document.getElementById('bug').onclick = function () { aller('retour'); };
    ({ plus: equipePlus, locations: equipeLocationsUI, materiel: equipeMaterielUI, reglages: equipeReglages, retraits: equipeRetraits, messages: equipeMessages, ajouter: equipeAjouter, stock: equipeStock, dons: equipeDons, animer: equipeAnimer })[v](document.getElementById('eq'));
  };

  function equipeRetraits(zone) {
    zone.innerHTML = '<form class="rangee" id="fcode" style="align-items:flex-end"><label class="champ" style="flex:2">Code du client<input name="code" placeholder="BP-XXXX" autocapitalize="characters" autocomplete="off" required></label>' +
      '<button class="bouton" style="flex:1">Valider</button></form><div id="lr"><p class="sous-titre">Chargement…</p></div>';
    document.getElementById('fcode').onsubmit = function (e) { e.preventDefault(); validerRetrait(e.target.code.value, e.target.querySelector('button')); };
    avecMemoire('equipeReservations').then(function (liste) {
      var lr = document.getElementById('lr'); if (!lr) return;
      if (!liste.length) { lr.innerHTML = '<div class="vide"><strong>Aucun retrait en attente</strong>Les nouvelles réservations apparaîtront ici.</div>'; return; }
      lr.innerHTML = '<h2 class="section">' + liste.length + ' réservation' + (liste.length > 1 ? 's' : '') + ' en attente</h2>' + liste.map(function (r) {
        var j = joursRestants(r.limite);
        return '<div class="resa">' + vignette(r.article) + '<div>' +
          '<h3>' + esc(r.article.titre) + '</h3><p class="meta">' + esc(r.prenom) + (r.telephone ? ', ' + esc(r.telephone) : '') + '</p>' +
          (r.emplacement ? '<p class="meta">Emplacement : ' + esc(r.emplacement) + '</p>' : '') +
          '<span class="code-retrait">' + esc(r.code) + '</span><br>' +
          (r.point ? '<p class="meta"><b>' + esc(r.point) + '</b></p>' : '') +
          (r.creneau ? '<span class="etiquette ok">Passe ' + esc(r.creneau) + '</span><br>' : '') +
          '<span class="etiquette ' + (j <= 1 ? 'urgent' : 'fini') + '">Limite : ' + esc(dateLongue(r.limite)) + '</span></div>' +
          '<div class="actions"><button class="bouton petit" data-ok="' + esc(r.code) + '">Retrait effectué</button><button class="bouton second petit" data-ecrire-client="' + esc(r.article.id || '') + '" data-email="' + esc(r.email) + '">' + ICONES.bulle + 'Écrire</button><button class="bouton second petit" data-ko="' + esc(r.code) + '">Annuler</button></div></div>';
      }).join('');
      lr.onclick = function (e) {
        var ec = e.target.closest('[data-ecrire-client]');
        if (ec) { aller('conversation', { idArticle: ec.dataset.ecrireClient, email: ec.dataset.email, equipe: true }); return; }
        var ok = e.target.closest('[data-ok]'), ko = e.target.closest('[data-ko]');
        if (ok) validerRetrait(ok.dataset.ok, ok);
        if (ko) modale('Annuler la réservation ' + ko.dataset.ko + ' ?', 'Le client est prévenu par mail. L\'article est proposé à la liste d\'attente ou remis en vente.', [
          { texte: 'Annuler la réservation', valeur: true, style: 'danger' }, { texte: 'Ne rien faire', valeur: false, style: 'second' }
        ]).then(function (oui) {
          if (!oui) return; chargement(ko, true);
          api('equipeAnnuler', { code: ko.dataset.ko }).then(function () { toast('Réservation annulée.'); etat.articles = null; vues.equipe(); })
            .catch(function (err) { chargement(ko, false); erreur(err); });
        });
      };
    }).catch(erreur);
  }
  function validerRetrait(code, btn) {
    chargement(btn, true);
    api('equipeValiderRetrait', { code: code }).then(function (r) { toast('Retrait validé : ' + r.article + ' est vendu.'); etat.articles = null; vues.equipe(); })
      .catch(function (err) { chargement(btn, false); erreur(err); });
  }

  function equipeAjouter(zone, brouillon, idEdition) {
    var c = cfg(), b = brouillon || etat.brouillon;
    zone.innerHTML = '<form class="pile" id="fa">' +
      '<div><p class="champ" style="margin:0 0 6px">Photos <small>(1 à 3, la première sert de couverture)</small></p><div class="photos-saisie" id="ph"></div></div>' +
      '<label class="champ">Titre<input name="titre" required maxlength="80" placeholder="Ex. Veste en jean Levi\'s"></label>' +
      '<label class="champ">Catégorie<select name="categorie">' + (c.categories || []).map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</select></label>' +
      '<label class="champ">Sous-catégorie<select name="sousCategorie"></select></label>' +
      '<label class="champ">Type d\'article <small>(sert au bilan CO₂ des clients)</small><select name="typeCO2"></select></label>' +
      '<div class="rangee"><label class="champ">Prix (€)<input name="prix" inputmode="decimal" required placeholder="12"></label>' +
      '<label class="champ">Prix soldé <small>(€, facultatif)</small><input name="prixSolde" inputmode="decimal" placeholder="—"></label></div>' +
      '<div id="champ-taille"></div>' +
      '<label class="champ">État<select name="etat"><option>Très bon état</option><option>Bon état</option><option>État correct</option><option>Neuf avec étiquette</option><option>À rénover</option></select></label>' +
      '<label class="champ">Description <small>(facultatif)</small><textarea name="description" maxlength="600" placeholder="Ce qui donne envie : style, usage, histoire de la pièce…"></textarea></label>' +
      '<fieldset class="bloc-specs"><legend>Caractéristiques techniques <small>(facultatif)</small></legend>' +
      '<div class="rangee"><label class="champ">Marque<input name="marque" maxlength="60"></label><label class="champ">Matière<input name="matiere" maxlength="60" placeholder="Coton, chêne…"></label></div>' +
      '<div class="rangee trois" id="dims"><label class="champ">Largeur <small>cm</small><input name="largeur" inputmode="decimal"></label><label class="champ">Profondeur <small>cm</small><input name="profondeur" inputmode="decimal"></label><label class="champ">Hauteur <small>cm</small><input name="hauteur" inputmode="decimal"></label></div>' +
      '<label class="case" id="case-teste"><input type="checkbox" name="teste" value="1"><span>Fonctionnement testé par l\'équipe</span></label>' +
      '<label class="champ">Détails techniques<textarea name="caracteristiques" maxlength="1500" placeholder="Puissance, contenance, composition, défauts précis, accessoires fournis…"></textarea></label></fieldset>' +
      '<div class="rangee"><label class="champ">Étiquette <small>(facultatif)</small><select name="etiquette"><option value="">Aucune</option>' + (c.etiquettes || []).map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</select></label>' +
      '<label class="champ">Provenance<select name="provenance"><option>Stock EBE</option><option>Don</option><option>Dépôt-vente</option></select></label></div>' +
      '<label class="case"><input type="checkbox" name="aLaUne" value="1"' + (b.aLaUne ? ' checked' : '') + '><span>Mettre à la une sur l\'accueil</span></label>' +
      '<label class="case"><input type="checkbox" name="volumineux" value="1"' + (b.volumineux ? ' checked' : '') + '><span>Objet volumineux (retrait uniquement aux points qui l\'acceptent ; automatique pour les meubles)</span></label>' +
      '<div class="rangee"><label class="champ">Préparé par <small>(prénom affiché)</small><input name="preparePar" placeholder="Votre prénom"></label>' +
      '<label class="champ">Poids <small>(kg, facultatif)</small><input name="poids" inputmode="decimal" placeholder="auto"></label></div>' +
      '<label class="champ">Emplacement dans le stock <small>(équipe seulement)</small><input name="emplacement" placeholder="Ex. étagère B2"></label>' +
      '<button class="bouton">' + (idEdition ? 'Enregistrer les modifications' : 'Mettre en ligne') + '</button></form>';
    var f = document.getElementById('fa');
    if (b.teste) f.teste.checked = true;
    function remplirTypes() {
      var types = (c.typesCO2 || []).filter(function (t) { return t.categorie === f.categorie.value; });
      f.typeCO2.innerHTML = '<option value="">Je ne sais pas (valeur prudente)</option>' + types.map(function (t) { return '<option>' + esc(t.type) + '</option>'; }).join('');
    }
    function remplirSousCats() {
      var scs = sousCats(f.categorie.value);
      f.sousCategorie.innerHTML = '<option value="">Aucune</option>' + scs.map(function (x) { return '<option>' + esc(x.nom) + '</option>'; }).join('');
      f.sousCategorie.closest('label').hidden = !scs.length;
    }
    function remplirTaille() {
      var g = grilleDe(f.categorie.value, f.sousCategorie.value), gr = g && ref().grilles[g];
      document.getElementById('champ-taille').innerHTML = gr && gr.type === 'liste'
        ? '<label class="champ">Taille<select name="taille"><option value="">Choisir</option>' + gr.valeurs.map(function (v) { return '<option' + (v === b.taille ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') + '</select></label>'
        : '<label class="champ">' + (f.categorie.value === 'Meubles' ? 'Dimensions <small>(résumé)</small>' : 'Taille <small>(facultatif)</small>') + '<input name="taille" value="' + esc(b.taille || '') + '" placeholder="' + (f.categorie.value === 'Meubles' ? '120 × 45 cm' : 'Taille unique, 1 L…') + '"></label>';
      document.getElementById('case-teste').hidden = f.categorie.value !== 'Objets';
    }
    if (b.categorie) f.categorie.value = b.categorie;
    remplirTypes(); remplirSousCats();
    if (b.sousCategorie) f.sousCategorie.value = b.sousCategorie;
    remplirTaille();
    f.categorie.addEventListener('change', function () { remplirTypes(); remplirSousCats(); b.typeCO2 = ''; b.sousCategorie = ''; b.taille = ''; remplirTaille(); });
    f.sousCategorie.addEventListener('change', function () { b.taille = ''; remplirTaille(); });
    ['titre', 'typeCO2', 'prix', 'prixSolde', 'etat', 'description', 'etiquette', 'provenance', 'preparePar', 'poids', 'emplacement', 'marque', 'matiere', 'largeur', 'profondeur', 'hauteur', 'caracteristiques'].forEach(function (k) {
      if (b[k] != null && b[k] !== '') f[k].value = b[k];
    });
    f.addEventListener('input', function (e) { var el = e.target; if (el.name && el.type !== 'checkbox' && el.type !== 'file') b[el.name] = el.value; });
    f.addEventListener('change', function (e) { var el = e.target; if (el.name && el.type !== 'checkbox') b[el.name] = el.value; });
    brancherPhotos(document.getElementById('ph'), b.photos, 3)();
    f.onsubmit = function (e) {
      e.preventDefault();
      if (!b.photos.length) { toast('Ajoutez au moins une photo.', true); return; }
      var btn = f.querySelector('.bouton'); chargement(btn, true, 'Envoi des photos…');
      var art = Object.fromEntries(new FormData(f)); art.aLaUne = !!art.aLaUne; art.teste = !!art.teste; art.volumineux = !!art.volumineux;
      if (idEdition) {
        return api('equipeModifierArticle', { id: idEdition, article: art, photos: b.photos }).then(function () {
          etat.articles = null; delete memoire['equipeArticles{}']; toast('Article modifié.'); retour();
        }).catch(function (err) { chargement(btn, false); erreur(err); });
      }
      api('equipeAjouterArticle', { article: art, photos: b.photos }).then(function () {
        etat.brouillon = { photos: [], categorie: art.categorie, sousCategorie: art.sousCategorie, etat: art.etat, provenance: art.provenance, preparePar: art.preparePar };
        etat.articles = null; toast('Article en ligne ! Les alertes correspondantes partiront d\'ici 15 minutes.'); vues.equipe();
      }).catch(function (err) { chargement(btn, false); erreur(err); });
    };
  }

  function equipeStock(zone) {
    var c = cfg();
    zone.innerHTML = '<p class="sous-titre">Chargement…</p>';
    avecMemoire('equipeArticles').then(function (liste) {
      if (!liste.length) { zone.innerHTML = '<div class="vide"><strong>Aucun article</strong>Mettez votre première pièce en ligne.</div>'; return; }
      var statuts = ['en vente', 'retiré', 'vendu'];
      zone.innerHTML = '<p class="sous-titre">L\'étoile met l\'article à la une. « Retiré » le masque de l\'app (abîmé, donné, vendu ailleurs).</p>' + liste.map(function (a) {
        var sel = a.statut === 'réservé' || a.statut === 'proposé' ? '<span class="etiquette urgent">' + esc(a.statut) + '</span>' :
          '<select data-statut="' + esc(a.id) + '" aria-label="Statut">' + statuts.map(function (s) { return '<option' + (s === a.statut ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>';
        return '<div class="ligne-article">' + '<div class="vignette">' + imgPhoto(a.photos[0], '', 200) + '</div><div><h3>' + esc(a.titre) + '</h3><p>' + prix(a.prix) + (a.prixInitial > a.prix ? ' <s>' + prix(a.prixInitial) + '</s>' : '') + (a.emplacement ? ', ' + esc(a.emplacement) : '') + '</p>' +
          '<button class="lien" data-modifier="' + esc(a.id) + '">Modifier</button>' +
          '<div class="outils"><button class="etoile" data-une="' + esc(a.id) + '" aria-pressed="' + !!a.aLaUne + '" aria-label="À la une">' + ICONES.etoile + '</button>' +
          '<select data-etiq="' + esc(a.id) + '" aria-label="Étiquette"><option value="">Sans étiquette</option>' + (c.etiquettes || []).map(function (x) { return '<option' + (x === a.etiquette ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></div></div>' + sel + '</div>';
      }).join('');
      var parId = {}; liste.forEach(function (a) { parId[a.id] = a; });
      function avant(id) {
        var a = parId[id], une = zone.querySelector('[data-une="' + id + '"]'), et = zone.querySelector('[data-etiq="' + id + '"]');
        return api('equipeMettreEnAvant', { idArticle: id, aLaUne: une.getAttribute('aria-pressed') === 'true', etiquette: et.value }).then(function () { etat.articles = null; a.aLaUne = une.getAttribute('aria-pressed') === 'true'; });
      }
      zone.onclick = function (e) {
        var md = e.target.closest('[data-modifier]'); if (md) { aller('editerArticle', { article: parId[md.dataset.modifier] }); return; }
        var u = e.target.closest('[data-une]'); if (!u) return;
        u.setAttribute('aria-pressed', String(u.getAttribute('aria-pressed') !== 'true'));
        avant(u.dataset.une).then(function () { toast(u.getAttribute('aria-pressed') === 'true' ? 'Mis à la une.' : 'Retiré de la une.'); }).catch(erreur);
      };
      zone.onchange = function (e) {
        var et = e.target.closest('[data-etiq]');
        if (et) { avant(et.dataset.etiq).then(function () { toast('Étiquette mise à jour.'); }).catch(erreur); return; }
        var s = e.target.closest('[data-statut]'); if (!s) return;
        s.disabled = true;
        api('equipeChangerStatut', { idArticle: s.dataset.statut, statut: s.value }).then(function () { s.disabled = false; etat.articles = null; toast('Statut mis à jour.'); })
          .catch(function (err) { s.disabled = false; erreur(err); });
      };
    }).catch(erreur);
  }

  function equipeDons(zone) {
    zone.innerHTML = '<p class="sous-titre">Chargement…</p>';
    avecMemoire('equipeDons').then(function (l) {
      if (!l.length) { zone.innerHTML = '<div class="vide"><strong>Aucune proposition</strong>Les dons proposés par les habitants arriveront ici.</div>'; return; }
      var lib = { 'nouveau': 'urgent', 'accepté': 'ok', 'refusé': 'fini', 'reçu': 'fini' };
      zone.innerHTML = l.map(function (d) {
        return '<div class="resa">' + vignette({ photos: d.photos, titre: d.description }) + '<div><h3>' + esc(d.description) + '</h3>' +
          (d.photos.length ? '<div class="photos-don">' + d.photos.map(function (ph) { return '<button data-agrandir>' + imgPhoto(ph, 'Photo du don', 800) + '</button>'; }).join('') + '</div>' : '') +
          '<p class="meta">' + esc(d.prenom) + (d.telephone ? ', ' + esc(d.telephone) : '') + ', ' + esc(dateLongue(d.date)) + '</p>' +
          '<p class="meta">' + esc(d.categorie) + ', ' + esc(d.mode) + (d.adresse ? ' (' + esc(d.adresse) + ')' : '') + '</p>' +
          '<span class="etiquette ' + (lib[d.statut] || 'fini') + '">' + esc(d.statut) + '</span>' + (d.reponse ? '<p class="reponse">« ' + esc(d.reponse) + ' »</p>' : '') + '</div>' +
          '<div class="actions">' + (d.statut === 'nouveau' ? '<button class="bouton petit" data-don="' + esc(d.id) + '" data-s="accepté">Accepter</button><button class="bouton second petit" data-don="' + esc(d.id) + '" data-s="refusé">Refuser</button>'
            : d.statut === 'accepté' ? '<button class="bouton second petit" data-don="' + esc(d.id) + '" data-s="reçu">Marquer comme reçu</button>' : '') + '</div></div>';
      }).join('');
      zone.onclick = function (e) {
        var ag = e.target.closest('[data-agrandir]'); if (ag) { var im = ag.querySelector('img'); if (im) ouvrirImage(im.src); return; }
        var b = e.target.closest('[data-don]'); if (!b) return;
        var s = b.dataset.s;
        var envoyer = function (msg) {
          chargement(b, true);
          api('equipeRepondreDon', { id: b.dataset.don, statut: s, message: msg || '' }).then(function () { toast(s === 'reçu' ? 'Don marqué comme reçu.' : 'Réponse envoyée par mail.'); vues.equipe(); })
            .catch(function (err) { chargement(b, false); erreur(err); });
        };
        if (s === 'reçu') return envoyer('');
        modale(s === 'accepté' ? 'Accepter ce don' : 'Refuser ce don', 'Un mail est envoyé à la personne avec votre message.', [
          { texte: s === 'accepté' ? 'Accepter et envoyer' : 'Refuser et envoyer', valeur: true, style: s === 'accepté' ? '' : 'danger' }, { texte: 'Annuler', valeur: false, style: 'second' }
        ], { label: 'Message (facultatif)', placeholder: s === 'accepté' ? 'Ex. Déposez-le mardi ou mercredi matin.' : 'Ex. Nous manquons de place pour les gros meubles en ce moment.' })
          .then(function (r) { if (r && r.valeur) envoyer(r.texte); });
      };
    }).catch(erreur);
  }

  function equipeAnimer(zone) {
    zone.innerHTML = '<p class="sous-titre">Chargement…</p>';
    api('equipeAnimations').then(function (d) {
      etat.themesDispo = d.themes;
      var enCours = d.enCours || { bandeaux: [] };
      zone.innerHTML = '<p class="sous-titre">Une animation change le thème et affiche un bandeau en haut du catalogue pendant sa période. Pour le thème, c\'est la première animation active de la liste qui compte.</p>' +
        '<h2 class="section">En ce moment</h2>' + (enCours.bandeaux.length ? htmlBandeaux(enCours.bandeaux) : '<p class="meta">Aucune animation en cours : thème classique.</p>') +
        '<h2 class="section">Programmées</h2>' + (d.animations.length ? d.animations.map(function (n) {
          return '<div class="ligne-anim"><div><b>' + esc(n.titre || n.theme) + '</b><span>' + esc(n.theme) + ', ' + (n.du ? 'du ' + esc(dateLongue(new Date(n.du + 'T12:00').getTime())) : 'sans début') + (n.au ? ' au ' + esc(dateLongue(new Date(n.au + 'T12:00').getTime())) : '') + '</span></div>' +
            '<label class="interrupteur"><input type="checkbox" data-actif="' + esc(n.id) + '"' + (n.active ? ' checked' : '') + '><span aria-hidden="true"></span><em class="sr">Active</em></label>' +
            '<button class="lien" data-edit="' + esc(n.id) + '">Modifier</button></div>';
        }).join('') : '<p class="meta">Aucune animation.</p>') +
        '<button class="bouton" id="nouvelle" style="margin-top:16px">Nouvelle animation</button>';
      zone.querySelectorAll('.bandeaux canvas').forEach(function (cv) { lancerParticules(cv, cv.dataset.particules); });
      document.getElementById('nouvelle').onclick = function () { aller('animation', { animation: { active: true, theme: 'Classique' } }); };
      zone.onclick = function (e) {
        var ed = e.target.closest('[data-edit]');
        if (ed) aller('animation', { animation: d.animations.filter(function (n) { return n.id === ed.dataset.edit; })[0] });
      };
      zone.onchange = function (e) {
        var ch = e.target.closest('[data-actif]'); if (!ch) return;
        var n = d.animations.filter(function (x) { return x.id === ch.dataset.actif; })[0];
        n.active = ch.checked;
        api('equipeSauverAnimation', { animation: n }).then(recharger).then(function () { toast(n.active ? 'Animation activée.' : 'Animation désactivée.'); equipeAnimer(zone); }).catch(erreur);
      };
    }).catch(erreur);
  }
  var LIBELLES_REGLAGES = { message_accueil: 'Message d\'accueil du catalogue', point_collecte_nom: 'Nom du point de collecte', point_collecte_adresse: 'Adresse du point de collecte',
    point_collecte_horaires: 'Horaires de retrait', telephone_ebe: 'Téléphone affiché aux clients', jours_ouverture: 'Jours d\'ouverture (pour les créneaux)',
    creneaux: 'Créneaux de passage proposés', delai_reponse: 'Délai de réponse annoncé dans la messagerie', presentation_ebe: 'Texte « Qui sommes-nous »' };
  function equipeReglages(zone) {
    zone.innerHTML = '<p class="meta">Chargement…</p>';
    api('equipeReglages').then(function (l) {
      zone.innerHTML = '<p class="sous-titre">Ces informations s\'affichent dans l\'app et les mails. Les autres réglages (délais, règles, catégories) restent dans l\'onglet Paramètres du Sheet.</p>' +
        '<form class="pile" id="freg">' + l.map(function (x) {
          var long = ['message_accueil', 'presentation_ebe', 'delai_reponse'].indexOf(x.cle) >= 0;
          return '<label class="champ">' + esc(LIBELLES_REGLAGES[x.cle] || x.cle) + (long ? '<textarea name="' + esc(x.cle) + '" maxlength="600">' + esc(x.valeur) + '</textarea>' : '<input name="' + esc(x.cle) + '" value="' + esc(x.valeur) + '" maxlength="300">') +
            (x.aide ? '<small class="aide">' + esc(x.aide) + '</small>' : '') + '</label>';
        }).join('') + '<button class="bouton">Enregistrer</button></form>' +
        '<h2 class="section">Points de retrait</h2><div id="points-equipe"><p class="meta">Chargement…</p></div>';
      dessinerPointsEquipe();
      document.getElementById('freg').onsubmit = function (e) {
        e.preventDefault();
        var btn = e.target.querySelector('.bouton'); chargement(btn, true);
        api('equipeSauverReglages', { valeurs: Object.fromEntries(new FormData(e.target)) }).then(recharger).then(function () { chargement(btn, false); toast('Réglages enregistrés. Ils s\'affichent tout de suite dans l\'app.'); })
          .catch(function (err) { chargement(btn, false); erreur(err); });
      };
    }).catch(erreur);
  }
  function dessinerPointsEquipe() {
    var z = document.getElementById('points-equipe'); if (!z) return;
    api('equipePoints').then(function (pts) {
      var carteP = function (x, i) {
        return '<fieldset class="bloc-specs point-edit" data-i="' + i + '"><legend>' + esc(x.nom || 'Nouveau point') + '</legend>' +
          '<label class="champ">Nom<input name="nom" value="' + esc(x.nom || '') + '"></label><label class="champ">Adresse<input name="adresse" value="' + esc(x.adresse || '') + '"></label>' +
          '<label class="champ">Horaires<input name="horaires" value="' + esc(x.horaires || '') + '"></label>' +
          '<label class="champ">Jours d\'ouverture <small>(séparés par des virgules, vide = jours par défaut)</small><input name="jours" value="' + esc(x.jours || '') + '" placeholder="mardi, mercredi, jeudi"></label>' +
          [['vente', 'Retrait des achats'], ['volumineux', 'Objets volumineux'], ['location', 'Location de matériel'], ['actif', 'Actif']].map(function (c0) {
            return '<label class="case"><input type="checkbox" name="' + c0[0] + '"' + (x[c0[0]] ? ' checked' : '') + '><span>' + c0[1] + '</span></label>'; }).join('') + '</fieldset>';
      };
      z.innerHTML = pts.map(carteP).join('') + '<div class="pile"><button class="bouton second" id="ajout-point">Ajouter un point</button><button class="bouton" id="sauver-points">Enregistrer les points</button></div>';
      document.getElementById('ajout-point').onclick = function () { pts.push({ actif: true, vente: true }); z.querySelector('.pile').insertAdjacentHTML('beforebegin', carteP(pts[pts.length - 1], pts.length - 1)); };
      document.getElementById('sauver-points').onclick = function () {
        var btn = this;
        var liste = [].slice.call(z.querySelectorAll('.point-edit')).map(function (fs) {
          var i = Number(fs.dataset.i), g = function (n0) { return fs.querySelector('[name="' + n0 + '"]'); };
          return { ligne: pts[i].ligne, nom: g('nom').value, adresse: g('adresse').value, horaires: g('horaires').value, jours: g('jours').value,
                   vente: g('vente').checked, volumineux: g('volumineux').checked, location: g('location').checked, actif: g('actif').checked };
        });
        chargement(btn, true);
        api('equipeSauverPoints', { points: liste }).then(recharger).then(function () { chargement(btn, false); toast('Points de retrait enregistrés.'); dessinerPointsEquipe(); })
          .catch(function (err) { chargement(btn, false); erreur(err); });
      };
    }).catch(erreur);
  }
  function recharger() { return api('config').then(function (c) { etat.config = c; appliquerTheme(c.animation && c.animation.theme); }); }

  vues.animation = function (p) {
    var n = Object.assign({}, p.animation), c = cfg();
    var themes = etat.themesDispo || ['Classique'];
    var liens = ['', 'À la une'].concat(c.categories || [], c.etiquettes || []);
    function cle(t) { return sansAccents(t).replace(/[^a-z0-9]+/g, '-'); }
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">' + (n.id ? 'Modifier l\'animation' : 'Nouvelle animation') + '</h1>' +
      '<div id="apercu"></div>' +
      '<form class="pile" id="fn">' +
      '<label class="champ">Thème<select name="theme">' + themes.map(function (t) { return '<option' + (t === n.theme ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></label>' +
      '<div class="rangee"><label class="champ">Du<input type="date" name="du" value="' + esc(n.du || '') + '"></label><label class="champ">Au<input type="date" name="au" value="' + esc(n.au || '') + '"></label></div>' +
      '<label class="champ">Titre du bandeau<input name="titre" maxlength="70" value="' + esc(n.titre || '') + '" placeholder="Ex. Noël de seconde main"></label>' +
      '<label class="champ">Texte <small>(facultatif)</small><textarea name="texte" maxlength="200">' + esc(n.texte || '') + '</textarea></label>' +
      '<div class="rangee"><label class="champ">Bouton<input name="bouton" maxlength="30" value="' + esc(n.bouton || '') + '" placeholder="Voir la sélection"></label>' +
      '<label class="champ">Mène vers<select name="lien">' + liens.map(function (l) { return '<option value="' + esc(l) + '"' + (l === n.lien ? ' selected' : '') + '>' + esc(l || 'Rien') + '</option>'; }).join('') +
        (n.lien && liens.indexOf(n.lien) < 0 ? '<option selected>' + esc(n.lien) + '</option>' : '') + '</select></label></div>' +
      '<div><p class="champ" style="margin:0 0 6px">Image de fond <small>(facultatif, remplace la couleur du thème)</small></p><div class="photos-saisie" id="ph-anim"></div></div>' +
      '<div class="rangee"><label class="champ">Remise <small>(%, facultatif)</small><input name="remise" inputmode="decimal" value="' + esc(n.remise || '') + '" placeholder="Ex. 50"></label>' +
      '<label class="champ">Sur<select name="remiseSur">' + ['Tout', 'Location', 'À la une'].concat(c.categories || [], c.etiquettes || []).map(function (x) { return '<option' + (x === (n.remiseSur || 'Tout') ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></label></div>' +
      '<label class="case"><input type="checkbox" name="popup" value="1"' + (n.popup ? ' checked' : '') + '><span>Afficher aussi en pop-up à l\'ouverture de l\'app (une fois par jour et par personne)</span></label>' +
      '<label class="case"><input type="checkbox" name="active" value="1"' + (n.active ? ' checked' : '') + '><span>Active (affichée pendant la période)</span></label>' +
      '<p class="meta">Astuce : « Mène vers » une étiquette (ex. Idée cadeau) affiche tous les articles qui la portent.</p>' +
      '<button class="bouton">Enregistrer</button>' + (n.id ? '<button type="button" class="bouton danger" id="suppr">Supprimer</button>' : '') + '</form>';
    var f = document.getElementById('fn');
    var imageAnim = n.image ? [n.image] : [];
    var dessinerImg = brancherPhotos(document.getElementById('ph-anim'), imageAnim, 1); dessinerImg();
    document.getElementById('ph-anim').addEventListener('click', function () { setTimeout(apercu, 400); });
    function apercu() {
      var d = Object.fromEntries(new FormData(f));
      arreterParticules();
      var ap = document.getElementById('apercu');
      ap.innerHTML = htmlBandeaux([{ theme: cle(d.theme), titre: d.titre || 'Titre du bandeau', texte: d.texte, bouton: d.bouton, lien: d.bouton ? { type: 'aucun' } : null, image: imageAnim[0] || '', remise: Number(d.remise) || 0, remiseSur: d.remiseSur }]);
      ap.querySelectorAll('canvas').forEach(function (cv) { lancerParticules(cv, cv.dataset.particules); });
    }
    f.addEventListener('input', apercu); f.addEventListener('change', apercu); apercu();
    f.onsubmit = function (e) {
      e.preventDefault();
      var d = Object.fromEntries(new FormData(f)); d.active = !!d.active; d.popup = !!d.popup; d.id = n.id;
      d.image = imageAnim[0] && !/^data:/.test(imageAnim[0]) ? imageAnim[0] : '';
      if (imageAnim[0] && /^data:/.test(imageAnim[0])) d.imageData = imageAnim[0];
      var btn = f.querySelector('.bouton'); chargement(btn, true);
      api('equipeSauverAnimation', { animation: d }).then(recharger).then(function () { toast('Animation enregistrée.'); retour(); }).catch(function (err) { chargement(btn, false); erreur(err); });
    };
    var s = document.getElementById('suppr');
    if (s) s.onclick = function () {
      modale('Supprimer cette animation ?', '', [{ texte: 'Supprimer', valeur: true, style: 'danger' }, { texte: 'Annuler', valeur: false, style: 'second' }]).then(function (ok) {
        if (ok) api('equipeSupprimerAnimation', { id: n.id }).then(recharger).then(function () { toast('Animation supprimée.'); retour(); }).catch(erreur);
      });
    };
  };

  // ================= Messagerie avec l'équipe =================
  function rafraichirNonLus() {
    if (!etat.jeton) { etat.nonLus = 0; etat.nonLusEquipe = 0; majPastille(); return Promise.resolve(); }
    var p1 = api('mesConversations').then(function (l) { etat.nonLus = l.filter(function (c) { return c.nonLuClient; }).length; }).catch(function () {});
    var p2 = etat.utilisateur && etat.utilisateur.role ? api('equipeConversations').then(function (l) { etat.nonLusEquipe = l.filter(function (c) { return c.nonLuEquipe; }).length; }).catch(function () {}) : Promise.resolve();
    return Promise.all([p1, p2]).then(majPastille);
  }
  function heureOuJour(ms) {
    var d = new Date(ms), auj = new Date();
    if (d.toDateString() === auj.toDateString()) return heure(ms);
    return d.getDate() + ' ' + MOIS[d.getMonth()].slice(0, 4) + (MOIS[d.getMonth()].length > 4 ? '.' : '');
  }
  function ligneConversation(c, equipe) {
    var nonLu = equipe ? c.nonLuEquipe : c.nonLuClient;
    return '<button class="ligne-conv' + (nonLu ? ' non-lu' : '') + '" data-conv="' + esc(c.id) + '">' + vignette(c.article) +
      '<span class="lc-texte"><b>' + esc(equipe ? (c.prenom || c.email) + ', ' + c.titre : c.titre) + '</b><span>' + esc(c.extrait || 'Nouvelle conversation') + '</span></span>' +
      '<span class="lc-date">' + esc(heureOuJour(c.dernier)) + (nonLu ? '<i aria-label="non lu"></i>' : '') + '</span></button>';
  }
  vues.messages = function () {
    $vue.innerHTML = '<h1 class="titre-page">Messages</h1>';
    if (!etat.jeton) {
      $vue.innerHTML += '<div class="vide"><strong>Une question sur un article ?</strong>Connectez-vous, puis touchez « Poser une question » sur sa fiche. L\'équipe vous répond ici.<button class="bouton" id="cx">Se connecter</button></div>';
      document.getElementById('cx').onclick = function () { etat.apresConnexion = function () { ouvrirOnglet('messages'); }; aller('connexion', {}); };
      return;
    }
    $vue.innerHTML += '<p class="sous-titre">' + esc(cfg().delaiReponse || '') + '</p><div id="liste-conv"><p class="meta">Chargement…</p></div>';
    avecMemoire('mesConversations').then(function (l) {
      var z = document.getElementById('liste-conv'); if (!z) return;
      etat.nonLus = l.filter(function (c) { return c.nonLuClient; }).length; majPastille();
      z.innerHTML = l.length ? l.map(function (c) { return ligneConversation(c, false); }).join('')
        : '<div class="vide"><strong>Aucune conversation</strong>Une question sur un article ? Touchez « Poser une question » sur sa fiche.<button class="bouton second" id="cat">Voir le catalogue</button></div>';
      var cat = document.getElementById('cat'); if (cat) cat.onclick = function () { ouvrirOnglet('catalogue'); };
      z.onclick = function (e) { var b = e.target.closest('[data-conv]'); if (b) aller('conversation', { id: b.dataset.conv }); };
    }).catch(erreur);
  };
  function equipeMessages(zone) {
    zone.innerHTML = '<p class="meta">Chargement…</p>';
    avecMemoire('equipeConversations').then(function (l) {
      etat.nonLusEquipe = l.filter(function (c) { return c.nonLuEquipe; }).length;
      zone.innerHTML = l.length ? '<p class="sous-titre">Les conversations non lues sont en haut. Engagement affiché aux clients : ' + esc(cfg().delaiReponse || '') + '</p>' + l.map(function (c) { return ligneConversation(c, true); }).join('')
        : '<div class="vide"><strong>Aucune question pour le moment</strong>Les questions des clients sur les articles arrivent ici.</div>';
      zone.onclick = function (e) { var b = e.target.closest('[data-conv]'); if (b) aller('conversation', { id: b.dataset.conv, equipe: true }); };
    }).catch(erreur);
  }

  var REPONSES_RAPIDES = ['Bonjour, votre article est prêt au point de retrait.', 'Pouvez-vous nous confirmer votre jour de passage ?', 'Petit rappel : votre réservation se termine bientôt.'];
  var QUESTIONS_OUTIL = ['Faut-il apporter quelque chose ?', 'Pouvez-vous me montrer comment l\'utiliser ?', 'Puis-je prolonger ma location ?', 'Il est disponible à quelle date ?'];
  var QUESTIONS_RESA = ['Je passerai le chercher demain.', 'Puis-je payer par carte ?', 'J\'ai un empêchement, comment faire ?'];
  var QUESTIONS_RAPIDES = ['Est-il toujours disponible ?', 'Pouvez-vous me donner les dimensions exactes ?', 'Y a-t-il des défauts à signaler ?', 'Puis-je le voir avant de réserver ?'];
  vues.conversation = function (p) {
    var equipe = !!p.equipe, idConv = p.id || null, dernierRendu = '';
    var photoJointe = [], premiereLecture = false;
    $vue.innerHTML = '<div class="tete-fixe">' + boutonRetour() + '<div id="conv-tete"></div></div><div id="fil" class="fil" aria-live="polite"><p class="meta">Chargement…</p></div>' +
      '<form class="barre-action saisie-message" id="fm"><div id="apercu-photo" hidden></div>' +
      '<button type="button" class="joindre" id="joindre" aria-label="Joindre une photo">' + ICONES.trombone + '</button>' +
      '<label class="sr" for="msg">Votre message</label><textarea id="msg" name="texte" rows="1" maxlength="1000" placeholder="' + (equipe ? 'Votre réponse' : 'Votre question à l\'équipe') + '"></textarea>' +
      '<button class="bouton envoyer" aria-label="Envoyer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg></button></form>';
    var fil = document.getElementById('fil'), ta = document.getElementById('msg');
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; });
    function rendre(r) {
      if (r && r.messages && dernierRendu && JSON.stringify(r.messages).length !== (etat.tailleConv || 0) && etat.relancerConv) etat.relancerConv();
      etat.tailleConv = r && r.messages ? JSON.stringify(r.messages).length : 0;
      if (!document.getElementById('fil')) return;
      if (r.conversation) idConv = r.conversation.id;
      var a = r.article || {};
      var tete = '<button class="conv-article" id="vers-article">' + vignette(a) + '<span><b>' + esc(a.titre || '') + '</b><span>' + (a.prix != null ? prix(a.prix) : '') + (a.statut && a.statut !== 'en vente' ? ', ' + esc(a.statut) : '') + '</span></span>' + ICONES.chevron + '</button>';
      if (r.reservation && r.reservation.location) tete += '<div class="conv-resa">Location <b>' + esc(r.reservation.code) + '</b> (' + esc(r.reservation.statut) + '), du ' + esc(dateLongue(r.reservation.debut)) + ' au ' + esc(dateLongue(r.reservation.fin)) + '</div>';
      else if (r.reservation) tete += '<div class="conv-resa">' + (r.reservation.statut === 'proposé'
        ? 'Proposé en priorité jusqu\'au ' + esc(dateLongue(r.reservation.limite)) + ', ' + heure(r.reservation.limite)
        : 'Réservé, code <b>' + esc(r.reservation.code) + '</b>, à retirer avant le ' + esc(dateLongue(r.reservation.limite)) + (r.reservation.creneau ? '. Passage prévu : ' + esc(r.reservation.creneau) : '')) + '</div>';
      if (equipe && r.client) tete += '<div class="conv-client"><span><b>' + esc(r.client.prenom || '') + '</b> ' + esc(r.client.email) + (r.client.telephone ? ', ' + esc(r.client.telephone) : '') + '</span>' +
        '<button class="bouton second petit options" id="options" aria-label="Options">•••</button></div>';
      document.getElementById('conv-tete').innerHTML = tete;
      var moi = equipe ? 'équipe' : 'client';
      var html = r.messages.length ? r.messages.map(function (m) {
        var mien = m.auteur === moi;
        return '<div class="bulle ' + (mien ? 'moi' : 'autre') + '">' + (m.photo ? '<button class="photo-msg" data-agrandir="' + esc(m.photo) + '">' + imgPhoto(m.photo, 'Photo envoyée', 800) + '</button>' : '') + (m.texte ? '<p>' + esc(m.texte) + '</p>' : '') + '<span>' + (m.auteur === 'équipe' && !mien ? esc((m.prenom || 'L\'équipe') + ', équipe') + ' · ' : '') + esc(heureOuJour(m.date)) +
          (!equipe && !mien ? ' <button class="lien signaler" data-signaler="' + esc(m.id) + '"' + (m.signale ? ' disabled>Signalé' : '>Signaler') + '</button>' : '') + (equipe && m.signale ? ' (signalé par le client)' : '') + '</span></div>';
      }).join('') : '<div class="conv-vide"><p>' + (equipe ? 'Écrivez au client : il sera prévenu par notification et par mail.' : esc(r.delaiReponse || '')) + '</p><div class="choix">' + (equipe ? REPONSES_RAPIDES : /^O/.test(String(p.idArticle || (r.conversation && r.conversation.idArticle) || '')) ? QUESTIONS_OUTIL : r.reservation ? QUESTIONS_RESA : QUESTIONS_RAPIDES).map(function (q) { return '<button class="puce" data-rapide="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div></div>';
      if (html !== dernierRendu) {
        dernierRendu = html; fil.innerHTML = html;
        window.scrollTo(0, document.body.scrollHeight);
      }
      var va = document.getElementById('vers-article');
      va.onclick = function () { garantirArticle(a); if (trouverArticle(a.id)) aller('article', { id: a.id }); };
      var op = document.getElementById('options');
      if (op) op.onclick = function () {
        var bloquer = !r.client.bloque;
        var choix = [];
        if (r.client.telephone) choix.push({ texte: 'Appeler ' + (r.client.prenom || 'le client'), valeur: 'appeler', style: 'second' });
        choix.push({ texte: bloquer ? 'Bloquer la messagerie de ce client' : 'Débloquer la messagerie', valeur: 'bloquer', style: bloquer ? 'danger' : 'second' });
        choix.push({ texte: 'Fermer', valeur: null, style: 'second' });
        modale('Options', esc(r.client.prenom || '') + ', ' + esc(r.client.email), choix).then(function (v) {
          if (v === 'appeler') return ouvrirExterne('tel:' + String(r.client.telephone).replace(/\s/g, ''));
          if (v !== 'bloquer') return;
          // Deuxième confirmation, pour éviter un blocage par erreur
          modale(bloquer ? 'Bloquer vraiment ' + (r.client.prenom || 'ce client') + ' ?' : 'Débloquer la messagerie ?', bloquer ? 'Il ne pourra plus envoyer de messages. Ses réservations ne changent pas. Vous pourrez le débloquer ensuite.' : '', [
            { texte: bloquer ? 'Oui, bloquer' : 'Débloquer', valeur: true, style: bloquer ? 'danger' : '' }, { texte: 'Annuler', valeur: false, style: 'second' }
          ]).then(function (ok) { if (ok) api('equipeBloquer', { email: r.client.email, bloquer: bloquer }).then(function () { toast(bloquer ? 'Client bloqué.' : 'Client débloqué.'); charger(); }).catch(erreur); });
        });
      };
    }
    function charger() {
      return api(equipe ? 'equipeLireConversation' : 'lireConversation', { id: idConv, idArticle: p.idArticle, email: p.email }).then(function (r) {
        rendre(r);
        if (!premiereLecture) { premiereLecture = true; if (equipe) etat.nonLusEquipe = Math.max(0, (etat.nonLusEquipe || 0) - 1); else etat.nonLus = Math.max(0, etat.nonLus - 1); majPastille(); }
      }).catch(function (e) { if (!dernierRendu) erreur(e); });
    }
    etat.rafraichirConversation = charger;
    function majApercu() {
      var ap = document.getElementById('apercu-photo'); if (!ap) return;
      ap.hidden = !photoJointe.length;
      ap.innerHTML = photoJointe.length ? '<img src="' + photoJointe[0] + '" alt="Photo à envoyer"><button type="button" class="suppr" aria-label="Retirer la photo">×</button><span>Photo jointe</span>' : '';
      var sp = ap.querySelector('.suppr'); if (sp) sp.onclick = function () { photoJointe = []; majApercu(); };
    }
    document.getElementById('joindre').onclick = function () {
      prendrePhoto().then(function (d) { if (d) { photoJointe = [d]; majApercu(); } }).catch(erreur);
    };
    fil.onclick = function (e) {
      var q = e.target.closest('[data-rapide]'); if (q) { ta.value = q.dataset.rapide; ta.focus(); return; }
      var ag = e.target.closest('[data-agrandir]');
      if (ag) { var im = ag.querySelector('img'); if (im) ouvrirImage(im.src); return; }
      var s = e.target.closest('[data-signaler]');
      if (s) modale('Signaler ce message ?', 'L\'équipe de l\'Entreprise à But d\'Emploi en sera informée.', [{ texte: 'Signaler', valeur: true, style: 'danger' }, { texte: 'Annuler', valeur: false, style: 'second' }])
        .then(function (ok) { if (ok) api('signalerMessage', { id: s.dataset.signaler }).then(function () { toast('Message signalé. Merci.'); charger(); }).catch(erreur); });
    };
    document.getElementById('fm').onsubmit = function (e) {
      e.preventDefault();
      var texte = ta.value.trim(); if (!texte && !photoJointe.length) return;
      var btn = e.target.querySelector('.envoyer'); btn.disabled = true;
      // Affichage immédiat du message, confirmé par le moteur juste après.
      var cv = fil.querySelector('.conv-vide'); if (cv) cv.remove();
      var tmp = document.createElement('div'); tmp.className = 'bulle moi envoi';
      tmp.innerHTML = (photoJointe[0] ? '<span class="photo-msg"><img src="' + photoJointe[0] + '" alt=""></span>' : '') + (texte ? '<p>' + esc(texte) + '</p>' : '') + '<span>Envoi…</span>';
      fil.appendChild(tmp); window.scrollTo(0, document.body.scrollHeight);
      var texteEnvoye = ta.value; ta.value = ''; ta.style.height = 'auto';
      api(equipe ? 'equipeRepondre' : 'envoyerMessage', { id: idConv, idArticle: p.idArticle, email: p.email, texte: texte, photo: photoJointe[0] || null }).then(function (r) {
        btn.disabled = false; photoJointe = []; majApercu(); dernierRendu = ''; rendre(r);
        if (etat.relancerConv) etat.relancerConv();
        ['mesConversations{}', 'equipeConversations{}'].forEach(function (cle) {
          var l = memoire[cle]; if (!l || !r.conversation) return;
          var c0 = l.filter(function (x) { return x.id === r.conversation.id; })[0];
          if (c0) { c0.extrait = texteEnvoye.slice(0, 90) || 'Photo envoyée'; c0.dernier = Date.now(); if (equipe) c0.nonLuEquipe = false; else c0.nonLuClient = false; l.sort(function (x, y) { return y.dernier - x.dernier; }); }
          else delete memoire[cle];
        });
        if (!equipe && r.messages.length === 1) Push.proposer('Vous saurez tout de suite quand l\'équipe vous répond.');
      }).catch(function (err) { btn.disabled = false; tmp.remove(); ta.value = texteEnvoye; erreur(err); });
    };
    charger();
    // Vérification des nouveaux messages : toutes les 4 s juste après un échange, puis de plus en plus espacé.
    var derniereActivite = Date.now();
    etat.relancerConv = function () { derniereActivite = Date.now(); };
    var boucle = function () {
      var calme = Date.now() - derniereActivite;
      var delai = calme < 60000 ? 4000 : calme < 300000 ? 10000 : 20000;
      etat.poll = setTimeout(function () {
        if (!document.hidden) charger().then(boucle, boucle); else boucle();
      }, delai);
    };
    boucle();
  };

  // ================= Mes tailles =================
  vues.mesTailles = function () {
    var u = etat.utilisateur || {}, choisies = (u.tailles || []).slice();
    var grilles = ref().grilles || {};
    var noms = Object.keys(grilles).filter(function (g) { return grilles[g].type === 'liste'; });
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">Mes tailles</h1><p class="sous-titre">Le filtre « À mes tailles » du catalogue affiche directement ce qui vous va. Ajoutez aussi les tailles de vos enfants.</p><div id="choix-tailles">' +
      noms.map(function (g) {
        return '<h2 class="section">' + esc(g) + '</h2><div class="choix">' + grilles[g].valeurs.map(function (v) {
          return '<button class="puce" data-t="' + esc(v) + '" aria-pressed="' + (choisies.indexOf(v) >= 0) + '">' + esc(v) + '</button>';
        }).join('') + '</div>';
      }).join('') + '</div><div class="barre-action"><button class="bouton" id="ok">Enregistrer</button></div>';
    document.getElementById('choix-tailles').onclick = (function sel(e) {
      var b = e.target.closest('[data-t]'); if (!b) return;
      var i = choisies.indexOf(b.dataset.t);
      if (i >= 0) choisies.splice(i, 1); else choisies.push(b.dataset.t);
      b.setAttribute('aria-pressed', String(i < 0));
    });
    document.getElementById('ok').onclick = function () {
      var btn = this; chargement(btn, true);
      api('enregistrerTailles', { tailles: choisies }).then(function (r) {
        etat.utilisateur.tailles = r.tailles; etat.pourMoi = r.tailles.length > 0;
        toast(r.tailles.length ? 'Tailles enregistrées.' : 'Tailles effacées.'); retour();
      }).catch(function (err) { chargement(btn, false); erreur(err); });
    };
  };

  // ================= Signaler un bug ou proposer une idée =================
  var NOMS_ECRANS = { catalogue: 'Catalogue', article: 'Fiche article', reserver: 'Réservation', confirmation: 'Confirmation', reservations: 'Mes réservations',
    compte: 'Compte', messages: 'Messages', conversation: 'Conversation', equipe: 'Espace équipe', alertes: 'Alertes', bilan: 'Bilan', inviter: 'Inviter',
    don: 'Don', mesDons: 'Mes dons', favoris: 'Favoris', mesTailles: 'Mes tailles', connexion: 'Connexion', creneau: 'Créneau', animation: 'Animation', apropos: 'Qui sommes-nous' };
  function appareil() {
    var ua = navigator.userAgent, ios = ua.match(/OS (\d+)_(\d+)/), and = ua.match(/Android ([\d.]+)/);
    var plat = Cap && Cap.getPlatform ? Cap.getPlatform() : 'web';
    return plat + (ios ? ' iOS ' + ios[1] + '.' + ios[2] : and ? ' Android ' + and[1] : '') + ', écran ' + window.innerWidth + '×' + window.innerHeight;
  }
  vues.retour = function () {
    var etatF = { type: 'bug', capture: [] };
    var ecran = NOMS_ECRANS[etat.ecran] || etat.ecran || '';
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">Aidez-nous à améliorer l\'app</h1>' +
      '<p class="sous-titre">Un bug, quelque chose de pas clair, une idée ? Chaque retour est lu par l\'équipe.</p>' +
      '<div class="types-retour" role="group" aria-label="Type de retour">' +
        '<button class="type-retour" data-type="bug" aria-pressed="true"><b>Un problème</b><span>Quelque chose ne marche pas</span></button>' +
        '<button class="type-retour" data-type="idée" aria-pressed="false"><b>Une idée</b><span>Une amélioration à proposer</span></button></div>' +
      '<form class="pile" id="fr" style="margin-top:16px"><label class="champ" id="label-msg">Que s\'est-il passé ?<textarea name="message" required maxlength="2000" placeholder="Ex. J\'ai touché « Réserver » et rien ne s\'est passé."></textarea></label>' +
      '<div><p class="champ" style="margin:0 0 6px">Capture d\'écran <small>(facultatif : faites-la avec les boutons du téléphone, puis ajoutez-la ici)</small></p><div class="photos-saisie" id="ph-retour"></div></div>' +
      (etat.jeton ? '<label class="case"><input type="checkbox" name="recontacter" checked><span>J\'accepte que l\'équipe me recontacte à ce sujet.</span></label>'
        : '<label class="champ">Votre mail <small>(facultatif, pour qu\'on puisse vous répondre)</small><input type="email" name="email" autocomplete="email"></label>') +
      '<p class="meta">Envoyé avec : écran « ' + esc(ecran) + ' », version ' + VERSION_APP + ', ' + esc(appareil()) + '.</p>' +
      '<button class="bouton">Envoyer</button></form>';
    var f = document.getElementById('fr');
    $vue.querySelector('.types-retour').onclick = function (e) {
      var b = e.target.closest('[data-type]'); if (!b) return;
      etatF.type = b.dataset.type;
      this.querySelectorAll('[data-type]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      var bug = etatF.type === 'bug';
      document.getElementById('label-msg').firstChild.textContent = bug ? 'Que s\'est-il passé ?' : 'Quelle est votre idée ?';
      f.message.placeholder = bug ? 'Ex. J\'ai touché « Réserver » et rien ne s\'est passé.' : 'Ex. Pouvoir trier les articles par prix.';
    };
    brancherPhotos(document.getElementById('ph-retour'), etatF.capture, 1)();
    f.onsubmit = function (e) {
      e.preventDefault();
      var d = Object.fromEntries(new FormData(f));
      var btn = f.querySelector('.bouton'); chargement(btn, true, 'Envoi…');
      api('envoyerRetour', { retour: { type: etatF.type, message: d.message, ecran: ecran, version: VERSION_APP, appareil: appareil(), recontacter: !!d.recontacter, email: d.email || '' }, capture: etatF.capture[0] || null })
        .then(function () { return modale('Merci !', etatF.type === 'bug' ? 'Votre signalement est bien arrivé. L\'équipe s\'en occupe.' : 'Votre idée est bien arrivée. L\'équipe l\'étudiera.', [{ texte: 'Retour à l\'app', valeur: true }]); })
        .then(function () { retour(); })
        .catch(function (err) { chargement(btn, false); erreur(err); });
    };
  };

  // ================= Location de matériel (outilthèque) =================
  var LIB_LOC = { 'réservée': ['Réservée', 'ok'], 'en cours': ['En cours', 'ok'], 'en retard': ['En retard', 'urgent'], 'rendue': ['Rendue, merci !', 'fini'], 'annulée': ['Annulée', 'fini'], 'non retirée': ['Non retirée', 'fini'] };
  function prixLocation(m, debut, fin) {
    var jours = Math.round((fin - debut) / 86400000) + 1, j = m.tarifJour || 0, we = m.tarifWeekend || 0, sem = m.tarifSemaine || 0;
    var o = [jours * j];
    if (sem) o.push(Math.floor(jours / 7) * sem + Math.min((jours % 7) * j, sem));
    var jd = debut.getDay();
    if (we && ((jd === 6 && jours >= 2 && jours <= 3) || (jd === 5 && jours >= 3 && jours <= 4))) o.push(we);
    o = o.filter(function (x) { return x > 0; });
    return { jours: jours, prix: o.length ? Math.round(Math.min.apply(null, o) * 100) / 100 : 0 };
  }
  function carteOutil(m) {
    var dispo = m.statut === 'disponible';
    return '<div class="carte outil' + (dispo ? '' : ' indispo') + '" data-outil="' + esc(m.id) + '" role="link" tabindex="0">' +
      '<div class="photo">' + imgPhoto(m.photos[0], '', 600) + (dispo ? '' : '<span class="voile">' + esc(m.statut) + '</span>') +
      htmlPrix(m.tarifJour, m.tarifJourInitial, '/jour') + '</div><h3>' + esc(m.nom) + '</h3><p>' + esc(m.categorie) + (m.tarifWeekend ? ', week-end ' + prix(m.tarifWeekend) : '') + '</p></div>';
  }
  vues.louer = function () {
    var c = cfg(), L = c.location || {};
    $vue.innerHTML = '<header class="marque"><h1><small>Bailleul</small>Louer du matériel</h1></header>' +
      '<p class="accroche">Bricolage, jardin : réservez en ligne, retirez au point de collecte, rapportez quand vous avez fini.</p>' +
      '<div class="recherche">' + ICONES.loupe + '<input type="search" placeholder="Perceuse, tondeuse, nettoyeur…" aria-label="Rechercher un outil" value="' + esc(etat.rechercheOutil || '') + '"></div>' +
      '<div class="puces" role="group" aria-label="Catégories">' + [''].concat(L.categories || []).map(function (cat) {
        return '<button class="puce" data-cat="' + esc(cat) + '" aria-pressed="' + ((etat.catOutil || '') === cat) + '">' + esc(cat || 'Tout') + '</button>'; }).join('') + '</div>' +
      '<div id="liste-outils"><div class="grille">' + '<div class="squelette"></div>'.repeat(4) + '</div></div>' +
      '<section class="encadre" style="margin-top:20px"><h3>Comment ça marche</h3><p>1. Choisissez vos dates. 2. Retirez l\'outil au point de collecte : ' + esc(c.point && c.point.nom) + '. 3. Rapportez-le à la date prévue.</p><p>' + esc(L.conditions || '') + '</p></section>';
    var z = document.getElementById('liste-outils');
    function dessiner() {
      var q = sansAccents(etat.rechercheOutil || ''), mots = motsRecherche(q);
      var l = (etat.outils || []).filter(function (m) {
        if (etat.catOutil && m.categorie !== etat.catOutil) return false;
        if (!mots.length) return true;
        var t = sansAccents([m.nom, m.categorie, m.description, m.caracteristiques].join(' '));
        return mots.every(function (w) { return variantes(w).some(function (v) { return t.indexOf(racine(v)) >= 0; }); });
      }).sort(function (a, b) { return (b.statut === 'disponible') - (a.statut === 'disponible'); });
      noterRecherche(etat.rechercheOutil, l.length, 'location');
      z.innerHTML = l.length ? '<div class="grille">' + l.map(carteOutil).join('') + '</div>' : '<div class="vide"><strong>Aucun outil ne correspond</strong>Une demande précise ? Écrivez à l\'équipe depuis l\'onglet Messages ou via « Signaler une idée ».</div>';
    }
    $vue.querySelector('.recherche input').oninput = function (e) { etat.rechercheOutil = e.target.value; dessiner(); };
    $vue.querySelector('.puces').onclick = function (e) { var b = e.target.closest('.puce'); if (!b) return; etat.catOutil = b.dataset.cat; this.querySelectorAll('.puce').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); dessiner(); };
    z.onclick = function (e) { var c0 = e.target.closest('[data-outil]'); if (c0) aller('outil', { id: c0.dataset.outil }); };
    avecMemoire('materiel').then(function (l) { etat.outils = l; dessiner(); }).catch(erreur);
  };

  vues.outil = function (p) {
    var m = (etat.outils || []).filter(function (x) { return x.id === p.id; })[0];
    if (!m) { retour(); return; }
    var c = cfg(), L = c.location || {}, choix = { debut: null, fin: null, consos: [], moment: '' };
    var dispo = m.statut === 'disponible';
    var photos = m.photos.length ? m.photos : [''];
    $vue.innerHTML = boutonRetour() +
      '<div class="galerie"><div class="defile">' + photos.map(function (ref) { return '<div>' + imgPhoto(ref, m.nom, 1200) + '</div>'; }).join('') + '</div>' + htmlPrix(m.tarifJour, m.tarifJourInitial, '/jour', true) + '</div>' +
      '<article class="fiche"><h2>' + esc(m.nom) + '</h2><div class="details"><span>' + esc(m.categorie) + '</span>' + (m.etat ? '<span>' + esc(m.etat) + '</span>' : '') + '</div>' +
      '<div class="rangee-boutons"><button class="bouton second petit" id="question">' + ICONES.bulle + 'Poser une question</button></div>' +
      (m.description ? '<p class="desc">' + esc(m.description) + '</p>' : '') +
      (m.caracteristiques ? '<section class="caracteristiques"><h3>Caractéristiques</h3><p>' + esc(m.caracteristiques) + '</p></section>' : '') +
      '<section class="caracteristiques"><h3>Tarifs</h3><dl>' +
        '<div><dt>La journée</dt><dd>' + prix(m.tarifJour) + '</dd></div>' +
        (m.tarifWeekend ? '<div><dt>Le week-end</dt><dd>' + prix(m.tarifWeekend) + '</dd></div>' : '') +
        (m.tarifSemaine ? '<div><dt>La semaine</dt><dd>' + prix(m.tarifSemaine) + '</dd></div>' : '') +
        (m.caution ? '<div><dt>Caution</dt><dd>' + prix(m.caution) + ' <small>(' + esc(L.caution || '') + ')</small></dd></div>' : '') + '</dl></section>' +
      (dispo ? '<h2 class="section">Vos dates</h2><p class="meta" id="aide-dates">Retrait et retour à <b>' + esc(pointLocation().nom || '') + '</b>' + (pointLocation().adresse ? ', ' + esc(pointLocation().adresse) : '') + '. Touchez le jour de retrait (à partir de demain), puis le jour de retour.</p><div id="calendrier"></div>' +
        ((c.creneaux || []).length ? '<h2 class="section">Moment du retrait</h2><div class="choix" id="moments">' + c.creneaux.map(function (x) { return '<button class="puce" data-moment="' + esc(x) + '" aria-pressed="false">' + esc(x) + '</button>'; }).join('') + '</div>' : '') +
        (m.consommables.length ? '<h2 class="section">Consommables</h2><div class="pile" id="consos">' + m.consommables.map(function (x) { return '<label class="case"><input type="checkbox" value="' + esc(x.nom) + '"><span>' + esc(x.nom) + ', ' + prix(x.prix) + '</span></label>'; }).join('') + '</div>' : '') +
        '<section class="encadre" style="margin-top:16px"><h3>Avant de réserver</h3><p>' + esc(L.conditions || '') + '</p></section>'
        : '<section class="encadre alerte"><h3>Indisponible pour le moment</h3><p>Cet outil est ' + esc(m.statut) + '. Posez une question à l\'équipe pour savoir quand il revient.</p></section>') +
      '</article>' + (dispo ? '<div class="barre-action"><p class="info-barre" id="resume">Choisissez vos dates</p><button class="bouton" id="louer" disabled>Réserver</button></div>' : '');
    document.getElementById('question').onclick = function () {
      if (exigerConnexion('Connectez-vous pour écrire à l\'équipe.', function () { aller('conversation', { idArticle: m.id }, true); })) aller('conversation', { idArticle: m.id });
    };
    if (!dispo) return;
    var pris = m.pris || [];
    api('outil', { id: m.id }).then(function (o) { pris = o.pris || []; m.pris = pris; dessinerCal(); }).catch(function () {});
    var ptLoc = pointLocation();
    var ouverts = (ptLoc.jours && ptLoc.jours.length) ? ptLoc.jours : (c.joursOuverture || []).length ? c.joursOuverture : JOURS;
    function dessinerCal() {
      var cal = document.getElementById('calendrier'); if (!cal) return;
      var auj = new Date(); auj.setHours(12, 0, 0, 0);
      var premier = new Date(auj.getTime() + (c.delaiPreparationJours == null ? 1 : c.delaiPreparationJours) * 86400000);
      var fin = new Date(auj.getTime() + (L.horizon || 60) * 86400000);
      var html = '', mois = new Date(auj.getFullYear(), auj.getMonth(), 1, 12);
      while (mois <= fin) {
        html += '<div class="mois"><h3>' + MOIS[mois.getMonth()] + ' ' + mois.getFullYear() + '</h3><div class="jours-sem"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div class="jours">';
        var dec = (mois.getDay() + 6) % 7;
        for (var k = 0; k < dec; k++) html += '<span></span>';
        var d = new Date(mois.getTime());
        while (d.getMonth() === mois.getMonth()) {
          var i = iso(d), passe = d < premier || d > fin, occupe = pris.indexOf(i) >= 0, ferme = ouverts.indexOf(JOURS[d.getDay()]) < 0;
          var sel = choix.debut && choix.fin ? (i >= choix.debut && i <= choix.fin) : i === choix.debut;
          var cls = ['jour', passe ? 'passe' : '', occupe ? 'occupe' : '', ferme ? 'ferme' : '', sel ? 'sel' : '', i === choix.debut ? 'bord' : '', i === choix.fin ? 'bord' : ''].filter(Boolean).join(' ');
          html += '<button class="' + cls + '" data-j="' + i + '"' + (passe || occupe ? ' disabled' : '') + ' aria-label="' + esc(dateLongue(d.getTime())) + (occupe ? ', déjà loué' : '') + '">' + d.getDate() + '</button>';
          d = new Date(d.getTime() + 86400000);
        }
        html += '</div></div>';
        mois = new Date(mois.getFullYear(), mois.getMonth() + 1, 1, 12);
      }
      cal.innerHTML = html + '<p class="legende"><i class="l-occ"></i> déjà loué <i class="l-fer"></i> point de collecte fermé (ni retrait ni retour)</p>';
      majResume();
    }
    function majResume() {
      var r = document.getElementById('resume'), b = document.getElementById('louer'); if (!r) return;
      if (!choix.debut) { r.textContent = 'Choisissez vos dates'; b.disabled = true; return; }
      if (!choix.fin) { r.textContent = 'Retrait le ' + dateLongue(new Date(choix.debut + 'T12:00').getTime()) + '. Choisissez le jour de retour.'; b.disabled = true; return; }
      var d0 = new Date(choix.debut + 'T12:00'), d1 = new Date(choix.fin + 'T12:00');
      var pl = prixLocation(m, d0, d1), conso = choix.consos.reduce(function (t, n) { var x = m.consommables.filter(function (y) { return y.nom === n; })[0]; return t + (x ? x.prix : 0); }, 0);
      r.innerHTML = pl.jours + ' jour' + (pl.jours > 1 ? 's' : '') + ', du ' + esc(dateLongue(d0.getTime())) + ' au ' + esc(dateLongue(d1.getTime())) + ' : <b>' + prix(pl.prix + conso) + '</b>' + (m.caution ? ' + caution ' + prix(m.caution) : '');
      b.disabled = false;
    }
    document.getElementById('calendrier').onclick = function (e) {
      var b = e.target.closest('[data-j]'); if (!b || b.disabled) return;
      var j = b.dataset.j, ferme = b.classList.contains('ferme');
      if (!choix.debut || choix.fin || j < choix.debut) {
        if (ferme) { toast('Le point de collecte est fermé ce jour-là : choisissez un autre jour de retrait.', true); return; }
        choix.debut = j; choix.fin = null;
      } else {
        if (ferme) { toast('Le point de collecte est fermé ce jour-là : choisissez un autre jour de retour.', true); return; }
        var duree = Math.round((new Date(j + 'T12:00') - new Date(choix.debut + 'T12:00')) / 86400000) + 1;
        if (duree > (L.dureeMax || 14)) { toast('Une location dure au maximum ' + (L.dureeMax || 14) + ' jours.', true); return; }
        for (var t = new Date(choix.debut + 'T12:00'); iso(t) <= j; t = new Date(t.getTime() + 86400000)) if (pris.indexOf(iso(t)) >= 0) { toast('L\'outil est déjà loué pendant cette période.', true); return; }
        choix.fin = j;
      }
      dessinerCal();
    };
    var zm = document.getElementById('moments');
    if (zm) zm.onclick = function (e) { var b = e.target.closest('.puce'); if (!b) return; choix.moment = b.dataset.moment; zm.querySelectorAll('.puce').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); };
    var zc = document.getElementById('consos');
    if (zc) zc.onchange = function () { choix.consos = [].slice.call(zc.querySelectorAll('input:checked')).map(function (x) { return x.value; }); majResume(); };
    document.getElementById('louer').onclick = function () {
      if (!exigerConnexion('Connectez-vous pour réserver « ' + m.nom + ' ».', function () { aller('outil', { id: m.id }, true); })) return;
      var btn = this; chargement(btn, true, 'Réservation…');
      api('reserverLocation', { idMateriel: m.id, debut: choix.debut, fin: choix.fin, consommables: choix.consos, moment: choix.moment }).then(function (r) {
        delete memoire['materiel{}'];
        majMemoire('mesResas{}', function (mm) {
          mm.locations = [{ code: r.code, statut: 'réservée', idOutil: r.outil.id, nom: r.outil.nom, photo: r.outil.photos[0], debut: r.debut, fin: r.fin, moment: r.moment,
            prix: r.prix, caution: r.caution, consommables: r.consommables, remise: { photos: [], etat: '' }, retour: { photos: [], etat: '' } }].concat(mm.locations || []);
        });
        etat.pile = [{ nom: 'louer', params: {} }];
        aller('confirmationLocation', { loc: r });
      }).catch(function (e) { chargement(btn, false); erreur(e); if (/Trop tard/.test(e.message)) api('outil', { id: m.id }).then(function (o) { pris = o.pris; choix.debut = choix.fin = null; dessinerCal(); }); });
    };
    dessinerCal();
  };

  vues.confirmationLocation = function (p) {
    var r = p.loc, c = cfg(), L = c.location || {};
    $vue.innerHTML = '<div class="bravo"><h1 class="titre-page">C\'est réservé !</h1><p class="sous-titre">« ' + esc(r.outil.nom) + ' » vous attend.</p>' +
      '<p>Votre code</p><div class="gros-code">' + esc(r.code) + '</div>' +
      '<section class="encadre"><h3>Retrait le ' + esc(dateLongue(r.debut)) + (r.moment ? ', ' + esc(r.moment) : '') + '</h3><p>Retour le ' + esc(dateLongue(r.fin)) + '</p>' +
        '<p>' + esc(c.point && c.point.nom) + ', ' + esc(c.point && c.point.adresse) + '</p><p>' + esc(c.point && c.point.horaires) + '</p>' +
        '<p>À régler au retrait : <b>' + prix(r.prix) + '</b>' + (r.consommables ? ' (dont ' + esc(r.consommables) + ')' : '') + '</p>' +
        (r.caution ? '<p>Caution : ' + prix(r.caution) + ', ' + esc(L.caution || '') + '</p>' : '') + '</section>' +
      '<p class="meta">' + esc(L.conditions || '') + '</p>' +
      '<div class="pile"><button class="bouton" id="voir">Voir mes locations</button><button class="bouton second" id="ecrire">' + ICONES.bulle + 'Une question ? Écrire à l\'équipe</button></div></div>';
    document.getElementById('voir').onclick = function () { ouvrirOnglet('reservations'); };
    document.getElementById('ecrire').onclick = function () { aller('conversation', { idArticle: r.outil.id }); };
  };

  /** Ouvre la fiche d'un article, même s'il n'est plus dans le catalogue (réservé, retiré). */
  function voirArticle(id) {
    if (trouverArticle(id)) return aller('article', { id: id });
    api('article', { id: id }).then(function (a) {
      etat.articles = (etat.articles || []).concat([a]);
      aller('article', { id: id });
    }).catch(function () { toast('Cet article n\'est plus visible dans le catalogue.', true); });
  }
  function dessinerMesLocations(l) {
    var z = document.getElementById('mes-locations'); if (!z) return;
    if (!l.length) { z.innerHTML = ''; return; }
    var actives = l.filter(function (x) { return ['réservée', 'en cours', 'en retard'].indexOf(x.statut) >= 0; });
    var finies = l.filter(function (x) { return actives.indexOf(x) < 0; }).slice(0, 5);
    var carteLoc = function (x) {
      var lib = LIB_LOC[x.statut] || [x.statut, 'fini'], act = actives.indexOf(x) >= 0;
      return '<div class="resa' + (act ? '' : ' passee') + '"><button class="vers-produit" data-voir-outil="' + esc(x.idOutil) + '">' + vignette({ photos: [x.photo], titre: x.nom }) + '</button><div><h3>' + esc(x.nom) + '</h3>' +
        '<p class="meta">Du ' + esc(dateLongue(x.debut)) + ' au ' + esc(dateLongue(x.fin)) + '</p><p class="meta">' + prix(x.prix) + (x.caution ? ', caution ' + prix(x.caution) : '') + '</p>' +
        (act ? '<span class="code-retrait">' + esc(x.code) + '</span><br>' : '') + '<span class="etiquette ' + lib[1] + '">' + esc(lib[0]) + '</span></div>' +
        '<div class="actions">' + (act ? '<button class="bouton second petit" data-ecrire-outil="' + esc(x.idOutil) + '">' + ICONES.bulle + 'Écrire à l\'équipe</button>' : '') +
        (x.remise.photos.length || x.retour.photos.length ? '<button class="bouton second petit" data-edl="' + esc(x.code) + '">État des lieux</button>' : '') +
        (x.statut === 'réservée' ? '<button class="bouton second petit" data-annuler-loc="' + esc(x.code) + '">Annuler</button>' : '') + '</div></div>';
    };
    z.innerHTML = '<h2 class="section">Mes locations</h2>' + (actives.length ? actives.map(carteLoc).join('') : '<p class="meta">Aucune location en cours.</p>') +
      (finies.length ? '<details class="historique"><summary>Locations passées</summary>' + finies.map(carteLoc).join('') + '</details>' : '') +
      '<h2 class="section">Mes achats</h2>';
    z.onclick = function (e) {
      var w = e.target.closest('[data-ecrire-outil]'); if (w) { aller('conversation', { idArticle: w.dataset.ecrireOutil }); return; }
      var vo = e.target.closest('[data-voir-outil]');
      if (vo) { var go = function () { if ((etat.outils || []).some(function (o) { return o.id === vo.dataset.voirOutil; })) aller('outil', { id: vo.dataset.voirOutil }); else toast('Cet outil n\'est plus proposé.', true); };
        if (etat.outils) go(); else api('materiel').then(function (lm) { etat.outils = lm; go(); }).catch(erreur); return; }
      var ed = e.target.closest('[data-edl]'); if (ed) { aller('voirEdl', { loc: l.filter(function (x) { return x.code === ed.dataset.edl; })[0] }); return; }
      var an = e.target.closest('[data-annuler-loc]'); if (!an) return;
      modale('Annuler cette location ?', 'L\'outil sera de nouveau disponible pour d\'autres personnes.', [{ texte: 'Oui, annuler', valeur: true, style: 'danger' }, { texte: 'Garder ma location', valeur: false, style: 'second' }])
        .then(function (ok) { if (ok) api('annulerLocation', { code: an.dataset.annulerLoc }).then(function () {
          toast('Location annulée.'); delete memoire['materiel{}'];
          majMemoire('mesResas{}', function (mm) { (mm.locations || []).forEach(function (x) { if (x.code === an.dataset.annulerLoc) x.statut = 'annulée'; }); });
          vues.reservations();
        }).catch(erreur); });
    };
  }

  vues.voirEdl = function (p) {
    var x = p.loc;
    var bloc = function (titre, e, date) {
      if (!e.photos.length && !e.etat) return '';
      return '<h2 class="section">' + titre + (date ? ', le ' + esc(dateLongue(date)) : '') + '</h2><div class="photos-edl">' + e.photos.map(function (ph) { return '<button data-agrandir>' + imgPhoto(ph, '', 600) + '</button>'; }).join('') + '</div>' +
        (e.etat ? '<p>' + esc(e.etat) + '</p>' : '') + (e.dommages ? '<p><b>Dommages :</b> ' + esc(e.dommages) + '</p>' : '');
    };
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">État des lieux</h1><p class="sous-titre">' + esc(x.nom) + ', location ' + esc(x.code) + '</p>' +
      bloc('À la remise', x.remise, x.remise.le) + bloc('Au retour', x.retour, x.retour.le);
    $vue.querySelector('.photos-edl') && ($vue.onclick = function (e) { var b = e.target.closest('[data-agrandir]'); if (b) { var im = b.querySelector('img'); if (im) ouvrirImage(im.src); } });
  };

  // ----- Équipe : locations et matériel -----
  function equipeLocationsUI(zone) {
    zone.innerHTML = '<form class="rangee" id="fcode-loc" style="align-items:flex-end"><label class="champ" style="flex:2">Code de location<input name="code" placeholder="LO-XXXX" autocapitalize="characters" autocomplete="off" required></label><button class="bouton" style="flex:1">Ouvrir</button></form><div id="ll"><p class="meta">Chargement…</p></div>';
    var liste = [];
    document.getElementById('fcode-loc').onsubmit = function (e) {
      e.preventDefault(); var c0 = e.target.code.value.toUpperCase().replace(/\s/g, ''); if (c0.indexOf('LO-') !== 0) c0 = 'LO-' + c0;
      var x = liste.filter(function (y) { return y.code === c0; })[0];
      if (!x) return toast('Aucune location en cours avec le code ' + c0 + '.', true);
      aller('edl', { loc: x, type: x.statut === 'réservée' ? 'remise' : 'retour' });
    };
    avecMemoire('equipeLocations').then(function (l) {
      liste = l;
      var ll = document.getElementById('ll'); if (!ll) return;
      var groupe = function (titre, items, type) {
        if (!items.length) return '';
        return '<h2 class="section">' + titre + ' (' + items.length + ')</h2>' + items.map(function (x) {
          var lib = LIB_LOC[x.statut] || [x.statut, 'fini'];
          return '<div class="resa">' + vignette({ photos: [x.photo], titre: x.nom }) + '<div><h3>' + esc(x.nom) + '</h3><p class="meta">' + esc(x.prenom) + (x.telephone ? ', ' + esc(x.telephone) : '') + '</p>' +
            '<p class="meta">Du ' + esc(dateLongue(x.debut)) + (x.moment ? ' (' + esc(x.moment) + ')' : '') + ' au ' + esc(dateLongue(x.fin)) + '</p>' +
            '<p class="meta">' + prix(x.prix) + (x.caution ? ', caution ' + prix(x.caution) : '') + (x.consommables ? ', ' + esc(x.consommables) : '') + '</p>' +
            '<span class="code-retrait">' + esc(x.code) + '</span><br><span class="etiquette ' + lib[1] + '">' + esc(lib[0]) + '</span></div>' +
            '<div class="actions"><button class="bouton petit" data-edl="' + esc(x.code) + '" data-type="' + type + '">' + (type === 'remise' ? 'Remettre l\'outil' : 'Enregistrer le retour') + '</button>' +
            '<button class="bouton second petit" data-ecrire="' + esc(x.idOutil) + '" data-email="' + esc(x.email) + '">' + ICONES.bulle + 'Écrire</button>' +
            (x.statut === 'réservée' ? '<button class="bouton second petit" data-annuler="' + esc(x.code) + '">Annuler</button>' : '') + '</div></div>';
        }).join('');
      };
      var retard = l.filter(function (x) { return x.statut === 'en retard'; }), aRemettre = l.filter(function (x) { return x.statut === 'réservée'; }), enCours = l.filter(function (x) { return x.statut === 'en cours'; });
      ll.innerHTML = (l.length ? groupe('En retard', retard, 'retour') + groupe('À remettre', aRemettre, 'remise') + groupe('En cours', enCours, 'retour')
        : '<div class="vide"><strong>Aucune location prévue</strong>Les réservations de matériel apparaîtront ici.</div>');
      ll.onclick = function (e) {
        var b = e.target.closest('[data-edl]'); if (b) { aller('edl', { loc: l.filter(function (x) { return x.code === b.dataset.edl; })[0], type: b.dataset.type }); return; }
        var w = e.target.closest('[data-ecrire]'); if (w) { aller('conversation', { idArticle: w.dataset.ecrire, email: w.dataset.email, equipe: true }); return; }
        var an = e.target.closest('[data-annuler]'); if (!an) return;
        modale('Annuler la location ' + an.dataset.annuler + ' ?', 'Le client est prévenu par mail et notification.', [{ texte: 'Annuler la location', valeur: true, style: 'danger' }, { texte: 'Ne rien faire', valeur: false, style: 'second' }])
          .then(function (ok) { if (ok) api('equipeAnnulerLocation', { code: an.dataset.annuler }).then(function () { toast('Location annulée.'); delete memoire['equipeLocations{}']; vues.equipe(); }).catch(erreur); });
      };
    }).catch(erreur);
  }

  /** État des lieux : photos obligatoires à la remise et au retour. */
  vues.edl = function (p) {
    var x = p.loc, remise = p.type === 'remise', photos = [];
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">' + (remise ? 'Remise' : 'Retour') + ' : ' + esc(x.nom) + '</h1>' +
      '<p class="sous-titre">' + esc(x.prenom) + ', code ' + esc(x.code) + '. Du ' + esc(dateLongue(x.debut)) + ' au ' + esc(dateLongue(x.fin)) + '.</p>' +
      (!remise && x.remise.photos.length ? '<h2 class="section">Photos à la remise</h2><div class="photos-edl">' + x.remise.photos.map(function (ph) { return '<button data-agrandir>' + imgPhoto(ph, '', 600) + '</button>'; }).join('') + '</div>' + (x.remise.etat ? '<p class="meta">' + esc(x.remise.etat) + '</p>' : '') : '') +
      '<form class="pile" id="fedl"><div><p class="champ" style="margin:0 0 6px">Photos de l\'état ' + (remise ? 'au départ' : 'au retour') + ' <small>(1 à 4, obligatoire : vue d\'ensemble, accessoires, défauts)</small></p><div class="photos-saisie" id="ph-edl"></div></div>' +
      '<label class="champ">État constaté<textarea name="etat" placeholder="' + (remise ? 'Ex. Fonctionne, 2 batteries chargées, mallette complète' : 'Ex. Propre, complet, fonctionne') + '"></textarea></label>' +
      (remise ? '<p class="meta">À encaisser : ' + prix(x.prix) + '</p><label class="case"><input type="checkbox" name="caution" value="1"' + (x.caution ? '' : ' checked') + '><span>Caution reçue' + (x.caution ? ' (' + prix(x.caution) + ')' : '') + '</span></label>'
        : '<label class="champ">Dommages ou éléments manquants <small>(facultatif)</small><textarea name="dommages"></textarea></label>' +
          '<label class="case"><input type="checkbox" name="caution" value="1"' + (x.caution ? '' : ' checked') + '><span>Caution rendue' + (x.caution ? ' (' + prix(x.caution) + ')' : '') + '</span></label>' +
          '<label class="case"><input type="checkbox" name="reparation" value="1"><span>Mettre l\'outil en réparation (il ne sera plus réservable)</span></label>') +
      '<button class="bouton">' + (remise ? 'Valider la remise' : 'Valider le retour') + '</button></form>';
    brancherPhotos(document.getElementById('ph-edl'), photos, 4)();
    $vue.onclick = function (e) { var b = e.target.closest('[data-agrandir]'); if (b) { var im = b.querySelector('img'); if (im) ouvrirImage(im.src); } };
    document.getElementById('fedl').onsubmit = function (e) {
      e.preventDefault();
      if (!photos.length) { toast('Ajoutez au moins une photo de l\'outil.', true); return; }
      var d = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector('.bouton');
      chargement(btn, true, 'Envoi des photos…');
      var appel = remise ? api('equipeRemise', { code: x.code, photos: photos, etat: d.etat, cautionRecue: !!d.caution })
        : api('equipeRetour', { code: x.code, photos: photos, etat: d.etat, dommages: d.dommages, cautionRendue: !!d.caution, reparation: !!d.reparation });
      appel.then(function () { delete memoire['equipeLocations{}']; delete memoire['materiel{}']; toast(remise ? 'Remise enregistrée. Bonne location au client !' : 'Retour enregistré.'); retour(); })
        .catch(function (err) { chargement(btn, false); erreur(err); });
    };
  };

  function equipeMaterielUI(zone, sansBouton) {
    zone.innerHTML = (sansBouton ? '' : '<button class="bouton" id="nouvel-outil">Ajouter un outil</button>') + '<div id="lm"><p class="meta">Chargement…</p></div>';
    var no = document.getElementById('nouvel-outil'); if (no) no.onclick = function () { aller('ajoutOutil', {}); };
    avecMemoire('equipeMateriel').then(function (l) {
      var lm = document.getElementById('lm'); if (!lm) return;
      lm.innerHTML = l.length ? l.map(function (m) {
        return '<div class="ligne-article"><div class="vignette">' + imgPhoto(m.photos[0], '', 200) + '</div><div><h3>' + esc(m.nom) + '</h3><p>' + prix(m.tarifJour) + '/jour' + (m.emplacement ? ', ' + esc(m.emplacement) : '') + '</p><button class="lien" data-modifier-outil="' + esc(m.id) + '">Modifier</button></div>' +
          '<select data-statut-outil="' + esc(m.id) + '" aria-label="Statut">' + ['disponible', 'en réparation', 'retiré'].map(function (s0) { return '<option' + (s0 === m.statut ? ' selected' : '') + '>' + s0 + '</option>'; }).join('') + '</select></div>';
      }).join('') : '<div class="vide"><strong>Aucun outil</strong>Ajoutez le premier outil de l\'outilthèque.</div>';
      lm.onclick = function (e) { var b0 = e.target.closest('[data-modifier-outil]'); if (b0) aller('ajoutOutil', { outil: l.filter(function (x) { return x.id === b0.dataset.modifierOutil; })[0] }); };
      lm.onchange = function (e) {
        var sl = e.target.closest('[data-statut-outil]'); if (!sl) return;
        api('equipeStatutMateriel', { id: sl.dataset.statutOutil, statut: sl.value }).then(function () { delete memoire['materiel{}']; toast('Statut mis à jour.'); }).catch(erreur);
      };
    }).catch(erreur);
  }

  vues.ajoutOutil = function (p) {
    var L = cfg().location || {}, o = (p && p.outil) || null, photos = o ? o.photos.slice() : [];
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">' + (o ? 'Modifier l\'outil' : 'Ajouter un outil') + '</h1><form class="pile" id="fo">' +
      '<div><p class="champ" style="margin:0 0 6px">Photos <small>(1 à 3)</small></p><div class="photos-saisie" id="ph-o"></div></div>' +
      '<label class="champ">Nom<input name="nom" required maxlength="80" placeholder="Ex. Perceuse-visseuse sans fil 18 V"></label>' +
      '<label class="champ">Catégorie<select name="categorie">' + (L.categories || []).map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</select></label>' +
      '<div class="rangee trois"><label class="champ">Jour (€)<input name="tarifJour" inputmode="decimal" required placeholder="9,99"></label><label class="champ">Week-end (€)<input name="tarifWeekend" inputmode="decimal"></label><label class="champ">Semaine (€)<input name="tarifSemaine" inputmode="decimal"></label></div>' +
      '<label class="champ">Caution (€)<input name="caution" inputmode="decimal" placeholder="80"></label>' +
      '<label class="champ">Description<textarea name="description" placeholder="À quoi il sert, pour qui"></textarea></label>' +
      '<label class="champ">Caractéristiques<textarea name="caracteristiques" placeholder="Puissance, batterie, accessoires fournis…"></textarea></label>' +
      '<label class="champ">Consommables en vente <small>(nom=prix, séparés par des virgules)</small><input name="consommables" placeholder="Forets bois=4.5, Embouts=3"></label>' +
      '<div class="rangee"><label class="champ">État<input name="etat" placeholder="Très bon état"></label><label class="champ">Emplacement<input name="emplacement" placeholder="Étagère C1"></label></div>' +
      '<label class="champ">Remise sur cet outil <small>(%, facultatif)</small><input name="remise" inputmode="decimal" placeholder="Ex. 20"></label>' +
      '<button class="bouton">' + (o ? 'Enregistrer les modifications' : 'Mettre en location') + '</button></form>';
    if (o) {
      var fo0 = document.getElementById('fo');
      var vals = { nom: o.nom, categorie: o.categorie, tarifJour: o.tarifJourBase, tarifWeekend: o.tarifWeekendBase, tarifSemaine: o.tarifSemaineBase, caution: o.caution,
        description: o.description, caracteristiques: o.caracteristiques, consommables: o.consommablesTexte, etat: o.etat, emplacement: o.emplacement, remise: o.remiseOutil };
      Object.keys(vals).forEach(function (k) { if (vals[k] != null && vals[k] !== '' && fo0[k]) fo0[k].value = vals[k]; });
    }
    brancherPhotos(document.getElementById('ph-o'), photos, 3)();
    document.getElementById('fo').onsubmit = function (e) {
      e.preventDefault();
      if (!photos.length) { toast('Ajoutez au moins une photo.', true); return; }
      var btn = e.target.querySelector('.bouton'); chargement(btn, true, 'Envoi…');
      (o ? api('equipeModifierMateriel', { id: o.id, outil: Object.fromEntries(new FormData(e.target)), photos: photos })
        : api('equipeAjouterMateriel', { outil: Object.fromEntries(new FormData(e.target)), photos: photos })).then(function () {
        delete memoire['materiel{}']; delete memoire['equipeMateriel{}']; toast(o ? 'Outil modifié.' : 'Outil mis en location.'); retour();
      }).catch(function (err) { chargement(btn, false); erreur(err); });
    };
  };

  // ================= Tableau de bord de l'équipe =================
  function equipeTableau(zone, rafraichir) {
    if (!memoire['equipeTableau{}']) zone.innerHTML = '<div class="tdb-squelette"><div></div><div></div><div></div><div></div></div>';
    var nb = function (x) { return x == null ? '—' : String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'); };
    var somme = function (l) { return (l || []).reduce(function (s0, x) { return s0 + x.nb; }, 0); };
    // Évolution par rapport à la période précédente : ▲ vert, ▼ rouge
    var tendance = function (v, avant) {
      if (avant == null || !(avant > 0)) return '';
      var pct = Math.round((v - avant) / avant * 100);
      if (pct === 0) return '<span class="tendance">= stable</span>';
      return '<span class="tendance ' + (pct > 0 ? 'hausse' : 'baisse') + '">' + (pct > 0 ? '▲ +' : '▼ ') + pct + ' %</span>';
    };
    var kpi = function (val, lib, opts) {
      opts = opts || {};
      return '<button class="kpi' + (opts.ton ? ' ' + opts.ton : '') + '"' + (opts.aller ? ' data-aller="' + opts.aller + '"' : '') + '>' +
        '<span class="kpi-lib">' + esc(lib) + '</span><b>' + val + '</b>' + (opts.sous ? '<span class="kpi-sous">' + opts.sous + '</span>' : '') + (opts.tendance || '') + '</button>';
    };
    var barres = function (l, unite, max) {
      if (!l || !l.length) return '<p class="meta">Pas encore de données.</p>';
      var m = Math.max.apply(null, l.map(function (x) { return x.nb; })) || 1;
      return '<div class="barres">' + l.slice(0, max || 6).map(function (x) {
        return '<div class="barre"><span class="lib">' + esc(x.nom) + '</span><span class="jauge"><i style="width:' + Math.max(4, Math.round(x.nb / m * 100)) + '%"></i></span><span class="val">' + nb(x.nb) + (unite || '') + '</span></div>';
      }).join('') + '</div>';
    };
    var puces = function (l, vide) { return l && l.length ? '<div class="choix">' + l.map(function (x) { return '<span class="puce statique">' + esc(x.nom) + (x.nb > 1 ? ' <em>' + x.nb + '</em>' : '') + '</span>'; }).join('') + '</div>' : '<p class="meta">' + vide + '</p>'; };
    // Section repliable : le résumé (toujours visible) donne déjà l'essentiel
    var pli = function (titre, resume, contenu, ouvert) {
      return '<details class="pli"' + (ouvert ? ' open' : '') + '><summary><span class="pli-titre">' + titre + '</span><span class="pli-resume">' + resume + '</span></summary><div class="pli-corps">' + contenu + '</div></details>';
    };
    var dessiner = function (t) {
      var a = t.aujourdhui, v = t.ventes, st = t.stock, lo = t.location, cl = t.clients, d = t.demande, im = t.impact;
      var af = t.aFaire || { retraits: [], dons: [], messages: [], locations: [] };
      var urgences = [];
      if (lo.actif && a.retards) urgences.push(['eq-locations', a.retards + ' location' + (a.retards > 1 ? 's' : '') + ' en retard', 'rouge']);
      if (a.finissentAujourdhui) urgences.push(['eq-retraits', a.finissentAujourdhui + ' réservation' + (a.finissentAujourdhui > 1 ? 's expirent' : ' expire') + ' ce soir', 'rouge']);
      if (a.messagesNonLus) urgences.push(['eq-messages', a.messagesNonLus + ' message' + (a.messagesNonLus > 1 ? 's' : '') + ' sans réponse', 'orange']);
      if (a.donsATraiter) urgences.push(['dons', a.donsATraiter + ' don' + (a.donsATraiter > 1 ? 's' : '') + ' à traiter', 'orange']);
      if (a.messagesSignales) urgences.push([null, a.messagesSignales + ' message' + (a.messagesSignales > 1 ? 's signalés' : ' signalé') + ' à vérifier', 'rouge']);
      if (lo.actif && lo.enReparation) urgences.push(['materiel', lo.enReparation + ' outil' + (lo.enReparation > 1 ? 's' : '') + ' en réparation', 'gris']);
      var maxCa = Math.max.apply(null, v.mois.map(function (m) { return m.ca; })) || 1;
      var listeAF = function (items, rendu, max) {
        if (!items.length) return '';
        return items.slice(0, max || 3).map(rendu).join('') + (items.length > (max || 3) ? '<p class="meta plus-af">et ' + (items.length - (max || 3)) + ' autre' + (items.length - (max || 3) > 1 ? 's' : '') + '…</p>' : '');
      };
      var ventesAuj = somme(a.retraitsAujourdhui), ventesDem = somme(a.retraitsDemain);
      zone.innerHTML =
        '<div class="tdb-entete"><span>' + esc(dateLongue(Date.now())) + '</span><button class="lien" id="maj-tdb">↻ Actualiser (' + heure(t.calculeLe) + ')</button></div>' +
        // 1. Ce qui demande une action
        (urgences.length ? '<div class="urgences">' + urgences.map(function (u) { return '<button class="urgence ' + u[2] + '"' + (u[0] ? ' data-aller="' + u[0] + '"' : '') + '>' + esc(u[1]) + '</button>'; }).join('') + '</div>'
          : '<div class="urgences"><span class="urgence vert">✓ Rien d\'urgent : tout est à jour</span></div>') +
        // 2. La journée en 4 chiffres
        '<div class="kpis">' +
          kpi(nb(ventesAuj), 'Retraits aujourd\'hui', { aller: 'eq-retraits', sous: a.retraitsAujourdhui.map(function (x) { return esc(x.nom) + ' ' + x.nb; }).join(' · ') || 'aucun créneau prévu', ton: ventesAuj ? 'accent' : '' }) +
          kpi(nb(ventesDem), 'Retraits demain', { aller: 'eq-retraits', sous: a.retraitsDemain.map(function (x) { return esc(x.nom) + ' ' + x.nb; }).join(' · ') || '—' }) +
          (lo.actif ? kpi(nb(a.locationsARemettre + a.locationsARecuperer), 'Locations du jour', { aller: 'eq-locations', sous: a.locationsARemettre + ' à remettre · ' + a.locationsARecuperer + ' à récupérer' })
            : kpi(nb(a.reservationsEnCours), 'Réservations en cours', { aller: 'eq-retraits', sous: a.sansCreneau + ' sans jour choisi' })) +
          kpi(nb(st.enVente), 'Articles en vente', { aller: 'eq-stock', sous: st.reserves + ' réservés' }) +
        '</div>' +
        // 3. À faire, concrètement
        ((af.retraits.length || af.dons.length || af.messages.length || af.locations.length) ? '<h2 class="section">À faire</h2><div class="afaire-grille">' +
          (af.retraits.length ? '<div class="bloc-afaire"><div class="tete-af"><h3>Retraits <em>' + af.retraits.length + '</em></h3><button class="lien" data-aller="eq-retraits">Tout voir</button></div>' + listeAF(af.retraits, function (r) {
            return '<button class="ligne-af" data-aller="eq-retraits"><span class="vignette">' + imgPhoto(r.photo, '', 200) + '</span><span><b>' + esc(r.titre) + '</b><span>' + esc(r.prenom) + ' · <strong>' + esc(r.code) + '</strong></span><span>' +
              (r.creneau ? esc(r.creneau) : '<em class="rouge-txt">dernier jour</em>') + (r.point ? ' · ' + esc(r.point) : '') + (r.emplacement ? ' · ' + esc(r.emplacement) : '') + '</span></span></button>'; }) + '</div>' : '') +
          (af.messages.length ? '<div class="bloc-afaire"><div class="tete-af"><h3>Messages <em>' + af.messages.length + '</em></h3><button class="lien" data-aller="eq-messages">Tout voir</button></div>' + listeAF(af.messages, function (m) {
            return '<button class="ligne-af" data-conv-af="' + esc(m.id) + '"><span><b>' + esc(m.prenom) + ' · ' + esc(m.article) + '</b><span>« ' + esc(m.dernier.slice(0, 80)) + ' »</span></span></button>'; }) + '</div>' : '') +
          (af.dons.length ? '<div class="bloc-afaire"><div class="tete-af"><h3>Dons <em>' + af.dons.length + '</em></h3><button class="lien" data-aller="dons">Tout voir</button></div>' + listeAF(af.dons, function (dn) {
            return '<div class="ligne-af">' + (dn.photos[0] ? '<button class="vignette" data-agrandir-don>' + imgPhoto(dn.photos[0], 'Photo du don', 800) + '</button>' : '<span class="vignette"></span>') +
              '<button class="texte-af" data-aller="dons"><b>' + esc(dn.description.slice(0, 60)) + '</b><span>' + esc(dn.prenom) + ' · ' + esc(dn.mode) + '</span></button></div>'; }) + '</div>' : '') +
          (lo.actif && af.locations.length ? '<div class="bloc-afaire"><div class="tete-af"><h3>Locations <em>' + af.locations.length + '</em></h3><button class="lien" data-aller="eq-locations">Tout voir</button></div>' + listeAF(af.locations, function (l) {
            return '<button class="ligne-af" data-aller="eq-locations"><span><b>' + esc(l.nom) + '</b><span>' + esc(l.prenom) + ' · <strong>' + esc(l.code) + '</strong> · ' + esc(l.statut) + '</span></span></button>'; }) + '</div>' : '') +
          '</div>' : '') +
        // 4. Les ventes, avec l'évolution
        '<h2 class="section">Ventes</h2><div class="kpis">' +
          kpi(prix(v.j7.ca), '7 derniers jours', { sous: nb(v.j7.ventes) + ' articles', tendance: tendance(v.j7.ca, v.j7prec && v.j7prec.ca) }) +
          kpi(prix(v.j30.ca), '30 derniers jours', { sous: nb(v.j30.ventes) + ' articles', tendance: tendance(v.j30.ca, v.j30prec && v.j30prec.ca) }) +
          kpi(prix(v.j30.panier), 'Prix moyen', { sous: 'sur 30 jours' }) +
          kpi(v.tauxRetrait == null ? '—' : v.tauxRetrait + ' %', 'Réservations retirées', { sous: v.nonRetirees30 + ' non retirées en 30 j', ton: v.tauxRetrait != null && v.tauxRetrait < 70 ? 'alerte' : '' }) +
        '</div>' +
        '<div class="histo">' + v.mois.map(function (m, k) {
          return '<div' + (k === v.mois.length - 1 ? ' class="courant"' : '') + '><em>' + (m.ca ? Math.round(m.ca) : '') + '</em><i style="height:' + Math.max(2, Math.round(m.ca / maxCa * 100)) + '%"></i><span>' + MOIS[Number(m.mois.slice(5)) - 1].slice(0, 3) + '</span></div>'; }).join('') + '</div>' +
        '<p class="meta">Depuis le début : ' + nb(v.depuisDebut.ventes) + ' articles vendus, ' + prix(v.depuisDebut.ca) + '.</p>' +
        // 5. Le détail, replié : le résumé suffit pour un coup d'œil
        '<h2 class="section">En détail</h2>' +
        pli('Ventes par catégorie et par point', esc((v.parCategorie[0] || {}).nom || '—') + ' en tête',
          '<h3 class="sous-section">Par catégorie (30 jours)</h3>' + barres(v.parCategorie) + '<h3 class="sous-section">Par point de retrait (30 jours)</h3>' + barres(v.parPoint)) +
        pli('Stock', nb(st.enVente) + ' en vente · <b class="' + (st.nbAnciens ? 'rouge-txt' : '') + '">' + nb(st.nbAnciens) + ' à relancer</b>',
          '<p class="meta">Valeur du stock en ligne : ' + prix(st.valeur) + '</p>' + barres(st.parCategorie) +
          (st.anciens.length ? '<h3 class="sous-section">En ligne depuis plus de 30 jours : baisser le prix ou mettre à la une</h3>' + st.anciens.map(function (x) {
            return '<div class="ligne-article"><div class="vignette">' + imgPhoto(x.photo, '', 200) + '</div><div><h3>' + esc(x.titre) + '</h3><p>' + prix(x.prix) + ' · ' + x.jours + ' jours</p></div></div>'; }).join('') : '') +
          (st.vitesse.length ? '<h3 class="sous-section">Ce qui part le plus vite (jours avant la vente)</h3>' + barres(st.vitesse.map(function (x) { return { nom: x.nom, nb: x.jours }; }), ' j') : '')) +
        pli('Ce que les gens cherchent', '<b class="' + (d.recherchesSansResultat.length ? 'rouge-txt' : '') + '">' + d.recherchesSansResultat.length + ' recherches sans résultat</b> · ' + nb(d.alertesActives) + ' alertes',
          '<h3 class="sous-section">Recherches sans résultat : à collecter en priorité</h3>' + puces(d.recherchesSansResultat, 'Aucune pour le moment.') +
          '<h3 class="sous-section">Alertes jamais servies (' + d.nbJamaisServies + ')</h3>' + (d.jamaisServies.length ? '<ul class="liste-simple">' + d.jamaisServies.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p class="meta">Toutes les alertes ont trouvé au moins un article.</p>') +
          '<h3 class="sous-section">Mots des alertes</h3>' + puces(d.motsAlertes, 'Pas encore d\'alertes.') +
          '<h3 class="sous-section">Les plus mis en favori</h3>' + (d.topFavoris.length ? d.topFavoris.map(function (x) {
            return '<div class="ligne-article"><div class="vignette">' + imgPhoto(x.photo, '', 200) + '</div><div><h3>' + esc(x.titre) + '</h3><p>' + prix(x.prix) + ' · ♥ ' + x.nb + '</p></div></div>'; }).join('') : '<p class="meta">Pas encore de favoris.</p>') +
          (d.attenteTop.length ? '<h3 class="sous-section">Listes d\'attente les plus longues</h3>' + barres(d.attenteTop.map(function (x) { return { nom: x.titre, nb: x.nb }; })) : '') +
          (d.taillesDemandees.length ? '<h3 class="sous-section">Tailles demandées</h3>' + barres(d.taillesDemandees) : '') +
          '<h3 class="sous-section">Recherches les plus fréquentes</h3>' + puces(d.recherchesTop, 'Pas encore de recherches.') +
          (d.budgetMoyen ? '<p class="meta">Budget maximum moyen indiqué dans les alertes : ' + prix(d.budgetMoyen) + '</p>' : '')) +
        (lo.actif ? pli('Location', nb(lo.locations30) + ' locations · ' + prix(lo.ca30) + ' en 30 j',
          '<p class="meta">Taux d\'occupation du matériel : ' + (lo.occupation == null ? '—' : lo.occupation + ' %') + ' · ' + lo.outils + ' outils · ' + lo.enReparation + ' en réparation · ' + lo.reservees + ' à venir</p>' +
          '<h3 class="sous-section">Outils les plus loués</h3>' + barres(lo.top)) : '') +
        pli('Clients', nb(cl.total) + ' inscrits · <b class="vert-txt">+' + nb(cl.nouveaux30) + '</b> ce mois-ci',
          '<p class="meta">' + nb(cl.actifs30) + ' venus sur l\'app en 30 jours · ' + nb(cl.acheteurs) + ' ont déjà acheté</p>' +
          '<h3 class="sous-section">Par commune</h3>' + barres(cl.parCommune) + '<h3 class="sous-section">Par âge</h3>' + barres(cl.parAge) + '<h3 class="sous-section">Comment ils nous ont connus</h3>' + barres(cl.parConnu)) +
        pli('Impact', nb(im.kgMois) + ' kg réemployés ce mois-ci',
          '<p class="meta">' + nb(im.co2Mois) + ' kg de CO₂ évités ce mois-ci · ' + nb(im.kgTotal) + ' kg et ' + nb(im.co2Total) + ' kg de CO₂ depuis le début · ' + im.dons.proposes + ' dons proposés, ' + im.dons.acceptes + ' acceptés en 30 jours</p>') +
        '<p class="meta">Le détail par client reste dans le Google Sheet ; ici, uniquement des chiffres globaux.</p>';
      document.getElementById('maj-tdb').onclick = function () { delete memoire['equipeTableau{}']; equipeTableau(zone, true); };
      zone.onclick = function (e) {
        var ag = e.target.closest('[data-agrandir-don]'); if (ag) { var im0 = ag.querySelector('img'); if (im0) ouvrirImage(im0.src); return; }
        var cv = e.target.closest('[data-conv-af]'); if (cv) { ouvrirOnglet('eq-messages'); aller('conversation', { id: cv.dataset.convAf, equipe: true }); return; }
        var b = e.target.closest('[data-aller]'); if (!b) return;
        var cible = b.dataset.aller;
        if (cible.indexOf('eq-') === 0) ouvrirOnglet(cible); else { etat.equipeVue = cible; vues.equipe(); }
      };
    };
    (rafraichir ? { then: function (f) { api('equipeTableau', { rafraichir: true }).then(f).catch(erreur); return { catch: function () {} }; } } : avecMemoire('equipeTableau')).then(dessiner).catch(erreur);
  }

  // ================= Profil (qui sont nos clients) et conditions d'utilisation =================
  function champsProfil(u) {
    var pr = cfg().profil || {};
    var sel = function (nom, label, opts, val, aide) {
      return '<label class="champ">' + label + (aide ? ' <small>' + aide + '</small>' : '') + '<select name="' + nom + '"><option value="">Choisir</option>' +
        (opts || []).map(function (o) { return '<option' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></label>';
    };
    return sel('age', 'Votre tranche d\'âge', pr.ages, u.age) + sel('commune', 'Votre commune', pr.communes, u.commune) +
      sel('connu', 'Comment nous avez-vous connus ?', pr.connu, u.connu, '(facultatif)');
  }
  /** Comptes créés avant les conditions d'utilisation : on les fait accepter une fois. */
  function verifierProfil() {
    var u = etat.utilisateur;
    if (!u || u.role || u.conditionsOk !== false) return;
    setTimeout(function () { aller('profil', { obligatoire: true }); }, 300);
  }
  vues.profil = function (p) {
    var u = etat.utilisateur || {};
    $vue.innerHTML = (p.obligatoire ? '' : boutonRetour()) + '<h1 class="titre-page">' + (p.obligatoire ? 'Nos conditions évoluent' : 'Mon profil') + '</h1>' +
      '<p class="sous-titre">' + (p.obligatoire ? 'Merci d\'accepter les conditions d\'utilisation pour continuer. Vous pouvez aussi nous dire qui vous êtes : ça nous aide à mieux vous servir (statistiques anonymes).' : 'Ces informations restent anonymes dans nos statistiques.') + '</p>' +
      '<form class="pile" id="fp">' + champsProfil(u) +
      (u.conditionsOk ? '' : '<label class="case"><input type="checkbox" name="accepte" required><span>J\'accepte les <a href="#" id="lien-cgu2">conditions d\'utilisation</a> et la <a href="#" id="lien-conf2">politique de confidentialité</a>.</span></label>') +
      '<button class="bouton">Enregistrer</button></form>';
    var l1 = document.getElementById('lien-cgu2'); if (l1) l1.onclick = function (e) { e.preventDefault(); ouvrirLien(cfg().urlConditions); };
    var l2 = document.getElementById('lien-conf2'); if (l2) l2.onclick = function (e) { e.preventDefault(); ouvrirLien(cfg().urlConfidentialite); };
    document.getElementById('fp').onsubmit = function (e) {
      e.preventDefault();
      var d = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector('.bouton');
      chargement(btn, true);
      api('completerProfil', { profil: { age: d.age, commune: d.commune, connu: d.connu }, accepte: !!d.accepte || !!u.conditionsOk }).then(function (u2) {
        etat.utilisateur = Object.assign(etat.utilisateur || {}, u2); toast('Merci !');
        if (p.obligatoire) ouvrirOnglet(accueil()); else retour();
      }).catch(function (err) { chargement(btn, false); erreur(err); });
    };
  };

  // ================= Espace équipe : « Plus » et stock =================
  function equipePlus(zone) {
    var items = [
      ['ajouter', ICONES.photo, 'Mettre un article en ligne'],
      ['materiel', ICONES.outil, 'Matériel en location'],
      ['dons', ICONES.feuille, 'Propositions de dons'],
      ['animer', ICONES.etoile, 'Animations, soldes et pop-up'],
      ['reglages', ICONES.reglages, 'Réglages et points de retrait'],
      ['suivi', ICONES.feuille, 'Tableau de suivi (Google Sheet)'],
      ['bug', ICONES.bulle, 'Signaler un bug ou une idée'],
      ['client', ICONES.coeur, 'Voir l\'app comme un client'],
      ['deco', ICONES.retour, 'Se déconnecter']
    ].filter(function (x) { return x[0] !== 'materiel' || (cfg().location && cfg().location.active); }).filter(function (x) { return x[0] !== 'suivi' || etat.utilisateur.urlSuivi; });
    zone.innerHTML = '<p class="sous-titre">Connecté avec ' + esc(etat.utilisateur.email) + '</p><nav class="menu">' + items.map(function (x) {
      return '<button data-plus="' + x[0] + '">' + x[1] + '<span>' + esc(x[2]) + '</span>' + ICONES.chevron + '</button>';
    }).join('') + '</nav>';
    zone.querySelector('.menu').onclick = function (e) {
      var b = e.target.closest('[data-plus]'); if (!b) return;
      var k = b.dataset.plus;
      if (k === 'suivi') return ouvrirLien(etat.utilisateur.urlSuivi);
      if (k === 'bug') return aller('retour');
      if (k === 'client') { etat.modeClient = true; ouvrirOnglet('catalogue'); toast('Vous voyez l\'app comme un client. Le bouton « Espace équipe » vous ramène.'); return; }
      if (k === 'deco') {
        return modale('Se déconnecter ?', '', [{ texte: 'Se déconnecter', valeur: true }, { texte: 'Annuler', valeur: false, style: 'second' }]).then(function (ok) {
          if (ok) { Push.oublier(); api('deconnexion').catch(function () {}); deconnecterLocalement(); ouvrirOnglet('catalogue'); }
        });
      }
      etat.equipeVue = k; vues.equipe();
    };
  }
  function equipeStockOnglets(zone) {
    var loc = cfg().location && cfg().location.active, v = etat.stockVue || 'articles';
    zone.innerHTML = (loc ? '<div class="segments"><button data-sv="articles" aria-pressed="' + (v === 'articles') + '">Articles en vente</button><button data-sv="materiel" aria-pressed="' + (v === 'materiel') + '">Matériel à louer</button></div>' : '') +
      '<button class="bouton" id="ajout-stock">' + (v === 'materiel' ? 'Ajouter un outil' : 'Mettre un article en ligne') + '</button><div id="stock-liste" style="margin-top:12px"></div>';
    var seg = zone.querySelector('.segments');
    if (seg) seg.onclick = function (e) { var b = e.target.closest('[data-sv]'); if (b) { etat.stockVue = b.dataset.sv; equipeStockOnglets(zone); } };
    document.getElementById('ajout-stock').onclick = function () { if (v === 'materiel') aller('ajoutOutil', {}); else { etat.equipeVue = 'ajouter'; vues.equipe(); } };
    (v === 'materiel' ? equipeMaterielUI : equipeStock)(document.getElementById('stock-liste'), true);
  }
  vues.editerArticle = function (p) {
    var a = p.article;
    var b = { photos: (a.photos || []).slice(), titre: a.titre, categorie: a.categorie, sousCategorie: a.sousCategorie, typeCO2: a.typeCO2, prix: a.prixInitial || a.prix,
      prixSolde: a.prixSolde, taille: a.taille, etat: a.etat, description: a.description, caracteristiques: a.caracteristiques,
      marque: a.specs && a.specs.marque, matiere: a.specs && a.specs.matiere, largeur: a.specs && a.specs.largeur, profondeur: a.specs && a.specs.profondeur, hauteur: a.specs && a.specs.hauteur,
      teste: a.specs && a.specs.teste, etiquette: a.etiquette, provenance: a.provenance, preparePar: a.preparePar, poids: a.poidsSaisi, emplacement: a.emplacement,
      aLaUne: a.aLaUne, volumineux: a.volumineuxCoche };
    $vue.innerHTML = boutonRetour() + '<h1 class="titre-page">Modifier l\'article</h1><div id="eq-form"></div>';
    equipeAjouter(document.getElementById('eq-form'), b, a.id);
  };

  // ================= Pop-up d'animation (une fois par jour) =================
  function popupAnimation() {
    var bs = ((cfg().animation || {}).bandeaux || []).filter(function (b) { return b.popup; });
    if (!bs.length || modeEquipe()) return;
    var b = bs[0], cle = 'popup_' + b.id + '_' + iso(new Date());
    stockage.get(cle).then(function (deja) {
      if (deja) return;
      stockage.set(cle, '1');
      var texte = (b.remise ? '<b class="remise-popup">−' + b.remise + ' % ' + esc(libelleRemise(b.remiseSur)) + '</b><br>' : '') + esc(b.texte || '');
      modale(b.titre, texte, [{ texte: b.bouton || 'Voir les articles', valeur: 'go' }, { texte: 'Plus tard', valeur: null, style: 'second' }]).then(function (v) {
        if (v !== 'go') return;
        var lien = b.lien || {};
        etat.categorie = ''; etat.recherche = ''; etat.filtre = null;
        if (lien.type === 'categorie') etat.categorie = lien.valeur;
        else if (lien.type === 'recherche') etat.recherche = lien.valeur;
        else if (lien.type === 'une') etat.filtre = { type: 'une', libelle: 'À la une' };
        else if (lien.type === 'etiquette') etat.filtre = { type: 'etiquette', valeur: lien.valeur, libelle: lien.valeur };
        if (sansAccents(b.remiseSur || '') === 'location') return ouvrirOnglet('louer');
        ouvrirOnglet('catalogue');
      });
    });
  }

  // ================= Version web installable (écran d'accueil) =================
  var invitationInstall = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); invitationInstall = e; });
  function estInstallee() { return NATIF || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone; }
  function bandeauInstallation() {
    if (estInstallee()) return '';
    var ios = /iPhone|iPad|iPod/.test(navigator.userAgent), mobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
    if (!mobile) return '';
    return '<button class="carte-install" id="installer">' + ICONES.partage + '<span><b>Installer l\'app sur votre téléphone</b>' +
      (ios ? 'Touchez Partager puis « Sur l\'écran d\'accueil ».' : 'Un geste, et elle s\'ouvre comme une vraie app.') + '</span></button>';
  }
  function brancherInstallation() {
    var b = document.getElementById('installer'); if (!b) return;
    b.onclick = function () {
      if (invitationInstall) { invitationInstall.prompt(); invitationInstall = null; return; }
      modale('Installer l\'app', 'Sur iPhone : touchez le bouton <b>Partager</b> (le carré avec une flèche, en bas de Safari), puis <b>Sur l\'écran d\'accueil</b>, puis <b>Ajouter</b>.<br><br>Sur Android : menu <b>⋮</b> de Chrome, puis <b>Installer l\'application</b> ou <b>Ajouter à l\'écran d\'accueil</b>.', [{ texte: 'Compris', valeur: true }]);
    };
  }

  // ================= Démarrage =================
  /** Un seul appel au moteur : configuration, compte, alertes, listes d'attente et messages non lus. */
  function appliquerDemarrage(d) {
    if (d.config) { etat.config = d.config; appliquerTheme(d.config.animation && d.config.animation.theme); }
    if (d.sessionExpiree) deconnecterLocalement();
    if (d.moi) {
      etat.utilisateur = d.moi; etat.moiLe = Date.now();
      etat.alertes = d.alertes || []; etat.mesAttentes = d.attentes || [];
      etat.nonLus = d.nonLus || 0; etat.nonLusEquipe = d.nonLusEquipe || 0;
      fusionnerFavoris(d.favoris);
      stockage.set('utilisateur', JSON.stringify(d.moi));
      majPastille();
    }
  }
  function chargerDonneesPerso() {
    if (!etat.jeton) return Promise.resolve();
    if (MODE_DEMO) stockage.get('pushDemo').then(function (v) { etat.pushActif = !!v; });
    else Push.activer(false);
    return api('demarrage').then(appliquerDemarrage).catch(function () {});
  }
  function demarrer() {
    Push.brancher();
    var copieSite = NATIF ? Promise.resolve(null) : fetch('donnees/site.json', { cache: 'no-cache' }).then(function (x) { return x.ok ? x.json() : null; }).catch(function () { return null; });
    Promise.all([stockage.get('jeton'), stockage.get('favoris'), stockage.get('catalogue'), stockage.get('config'), stockage.get('memo_resa'), stockage.get('utilisateur'), copieSite]).then(function (r) {
      try { if (r[4] && r[0]) { var mr = JSON.parse(r[4]); if (mr.achats) memoire['mesResas{}'] = mr; } } catch (e) {}
      stockage.get('memo_tableau').then(function (t) { try { if (t && r[0]) memoire['equipeTableau{}'] = JSON.parse(t); } catch (e) {} });
      try { if (r[5] && r[0]) etat.utilisateur = JSON.parse(r[5]); } catch (e) {}
      etat.jeton = r[0] || '';
      try { etat.favoris = JSON.parse(r[1] || '[]'); } catch (e) { etat.favoris = []; }
      // Affichage immédiat du dernier catalogue connu, mis à jour juste après en arrière-plan.
      try { if (r[2]) { var cat = JSON.parse(r[2]); if (Array.isArray(cat)) etat.articles = cat; else { etat.articles = cat.articles; etat.versionCatalogue = cat.version; } } } catch (e) {}
      try { if (r[3]) { etat.config = JSON.parse(r[3]); appliquerTheme(etat.config.animation && etat.config.animation.theme); } } catch (e) {}
      // Copie publiée sur le site (quelques secondes de retard au plus) : affichage immédiat, sans attendre le moteur.
      var site = r[6];
      if (site && site.config && site.catalogue) {
        etat.config = site.config; appliquerTheme(site.config.animation && site.config.animation.theme);
        etat.articles = site.catalogue.articles; etat.versionCatalogue = site.catalogue.version;
        if (site.materiel) { etat.outils = site.materiel; memoire['materiel{}'] = site.materiel; }
      }
      var suite = api('demarrage').then(function (d) {
        var modeAvant = modeEquipe();
        appliquerDemarrage(d);
        if (d.config) stockage.set('config', JSON.stringify(d.config));
        if (etat.jeton && !d.moi) deconnecterLocalement();
        if (etat.jeton) { if (MODE_DEMO) stockage.get('pushDemo').then(function (v) { etat.pushActif = !!v; }); else Push.activer(false); }
        return modeAvant !== modeEquipe();
      }).catch(function () { if (!etat.config) etat.config = null; return false; });
      // Si on a déjà de quoi afficher, on n'attend pas le moteur.
      return etat.config ? { suite: suite } : suite.then(function () { return {}; });
    }).then(function (o) {
      ouvrirOnglet(accueil());
      if (Plugins.SplashScreen) Plugins.SplashScreen.hide();
      var apres = function (modeChange) {
        if (modeChange) ouvrirOnglet(accueil()); else { majPastille(); var c0 = etat.pile[etat.pile.length - 1]; if (c0 && c0.nom === 'catalogue') vues.catalogue(); }
        verifierProfil();
        if (etat.articles) chargerArticles().then(redessinerSiCatalogue).catch(function () {});
        setTimeout(precharger, 1500);
        ouvrirDepuisLien();
      };
      if (o && o.suite) o.suite.then(apres); else apres(false);
    });
    if (Plugins.App) Plugins.App.addListener('appStateChange', function (s) {
      if (!s.isActive) return;
      Promise.all([chargerDonneesPerso(), chargerArticles().catch(function () {})]).then(function () {
        var c = etat.pile[etat.pile.length - 1];
        if (c && (c.nom === 'catalogue' || c.nom === 'reservations')) vues[c.nom]();
      });
    });
  }
  /** Notification touchée dans la version web : le site s'ouvre avec ?ouvrir=… */
  function ouvrirDepuisLien() {
    var ar = /[?&]article=([^&]+)/.exec(location.search || '');
    if (ar) { try { history.replaceState(null, '', location.pathname); } catch (e) {} if (!modeEquipe()) voirArticle(decodeURIComponent(ar[1])); return; }
    var m = /[?&]ouvrir=([^&]+)/.exec(location.search || '');
    if (!m) return;
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    try { Push.ouvrir(JSON.parse(decodeURIComponent(m[1]))); } catch (e) {}
  }
  function redessinerSiCatalogue() { var c = etat.pile[etat.pile.length - 1]; if (c && c.nom === 'catalogue' && document.getElementById('liste')) dessinerListe(); }
  demarrer();
})();
