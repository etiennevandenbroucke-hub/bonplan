/* Mode démo : simule l'API quand config.js ne contient pas d'URL. Rien n'est enregistré.
   Connexion : n'importe quelle adresse, code 123456. Le compte démo a accès à l'espace équipe. */
(function () {
  function visuel(fond, forme) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="' + fond + '"/>' + forme + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  var veste = '<path d="M140 110l60 30 60-30 70 50-30 60-30-15v190H130V205l-30 15-30-60z" fill="#3E5F8A"/><path d="M200 140v250" stroke="#2A4466" stroke-width="6"/>';
  var robe = '<path d="M170 100h60l10 70 60 220H100l60-220z" fill="#B0413E"/><path d="M170 100l-20-30M230 100l20-30" stroke="#B0413E" stroke-width="10"/>';
  var chaise = '<path d="M140 90h120v150H140z" fill="#8A5A34"/><path d="M120 240h160v30H120z" fill="#6E4527"/><path d="M135 270v150M265 270v150" stroke="#6E4527" stroke-width="16"/>';
  var lampe = '<path d="M150 120h100l40 110H110z" fill="#E9C46A"/><path d="M200 230v170" stroke="#444" stroke-width="10"/><path d="M150 400h100" stroke="#444" stroke-width="16"/>';
  var theiere = '<ellipse cx="200" cy="290" rx="110" ry="90" fill="#5E8C61"/><path d="M300 270l60-40-10 30-40 40z" fill="#5E8C61"/><path d="M90 250c-50 0-50 80 0 80" stroke="#5E8C61" stroke-width="18" fill="none"/><rect x="170" y="180" width="60" height="25" rx="10" fill="#4A7050"/>';
  var buffet = '<rect x="70" y="160" width="260" height="220" fill="#A47148"/><path d="M200 160v220M70 230h260" stroke="#7A5232" stroke-width="6"/><path d="M90 380v40M310 380v40" stroke="#7A5232" stroke-width="14"/>';

  var maintenant = Date.now();
  var J = 86400000;
  function isoJ(d) { var x = new Date(Date.now() + d * J); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
  var articles = [
    { id: 'A1', categorie: 'Vêtements', titre: 'Veste en jean brut', description: 'Coupe droite, boutons métal. Aucune trace d\'usure.', taille: 'M', etat: 'Très bon état', prix: 14, photos: [visuel('#DCE3EA', veste)], statut: 'en vente', aLaUne: true, etiquette: 'Coup de cœur', preparePar: 'Karim', poids: 0.8, misEnLigne: maintenant },
    { id: 'A2', categorie: 'Vêtements', titre: 'Robe d\'été rouge', description: 'Viscose légère, longueur genou.', taille: '38', etat: 'Bon état', prix: 9, photos: [visuel('#F3E3DF', robe)], statut: 'en vente', etiquette: 'Idée cadeau', preparePar: 'Nadia', poids: 0.3, misEnLigne: maintenant - 1 },
    { id: 'A3', categorie: 'Meubles', titre: 'Chaise bistrot en hêtre', description: 'Restaurée et revernie par l\'atelier.', taille: 'H. 85 cm', etat: 'Très bon état', prix: 22, photos: [visuel('#EFE6DA', chaise)], statut: 'en vente', aLaUne: true, preparePar: 'Julien', poids: 5, misEnLigne: maintenant - 2 },
    { id: 'A4', categorie: 'Objets', titre: 'Lampe de chevet années 70', description: 'Ampoule E27 fournie. Testée.', taille: 'H. 40 cm', etat: 'Bon état', prix: 12, photos: [visuel('#F5F0DF', lampe)], statut: 'réservé', nbAttente: 1, etiquette: 'Pièce rare', poids: 1.5, misEnLigne: maintenant - 3 },
    { id: 'A5', categorie: 'Objets', titre: 'Théière émaillée', description: 'Contenance 1 litre.', taille: '1 L', etat: 'Très bon état', prix: 6.5, photos: [visuel('#E2ECE2', theiere)], statut: 'en vente', etiquette: 'Idée cadeau', aLaUne: true, preparePar: 'Nadia', poids: 1, misEnLigne: maintenant - 4 },
    { id: 'A6', categorie: 'Meubles', titre: 'Buffet bas deux portes', description: 'Chêne massif, à retirer sur place (prévoir un véhicule).', taille: '120 × 45 × 80 cm', etat: 'État correct', prix: 45, photos: [visuel('#EEE3D6', buffet)], statut: 'en vente', etiquette: 'Petit prix', preparePar: 'Julien', poids: 35, misEnLigne: maintenant - 5 }
  ];
  var co2s = { A1: 26.8, A2: 52.5, A3: 18.6, A4: 0, A5: 0, A6: 18.6 };
  var extra = {
    A1: { sousCategorie: 'Homme', specs: { marque: 'Levi\'s', matiere: 'Denim de coton' }, caracteristiques: 'Coupe droite, longueur hanches.\nBoutons métal, deux poches poitrine.' },
    A2: { sousCategorie: 'Femme', specs: { matiere: 'Viscose' }, caracteristiques: 'Doublée. Fermeture éclair au dos.' },
    A3: { sousCategorie: 'Cuisine', specs: { matiere: 'Hêtre massif', largeur: 42, profondeur: 45, hauteur: 85 }, caracteristiques: 'Assise 46 cm. Restaurée : ponçage et vernis mat.' },
    A4: { sousCategorie: 'Déco', specs: { teste: true }, caracteristiques: 'Ampoule E27 fournie, 40 W max. Câble 1,5 m avec interrupteur.' },
    A5: { sousCategorie: 'Vaisselle', specs: { matiere: 'Acier émaillé' }, caracteristiques: 'Compatible gaz et électrique, pas induction.' },
    A6: { sousCategorie: 'Rangement', specs: { matiere: 'Chêne massif', largeur: 120, profondeur: 45, hauteur: 80 }, caracteristiques: 'Une étagère intérieure. Petite rayure sur le dessus (voir photo).' }
  };
  articles.forEach(function (a) { a.disponible = a.statut === 'en vente'; a.nbAttente = a.nbAttente || 0; a.co2 = co2s[a.id] || 0; Object.assign(a, extra[a.id]); a.specs = Object.assign({ marque: '', matiere: '', largeur: null, profondeur: null, hauteur: null, teste: false }, a.specs); });
  articles.push({ id: 'A7', categorie: 'Vêtements', sousCategorie: 'Enfant', titre: 'Pyjama étoiles', description: 'Tout doux, lavé et repassé.', taille: '12 mois', etat: 'Très bon état', prix: 3, photos: [visuel('#E8E6F3', '<rect x="130" y="110" width="140" height="260" rx="30" fill="#7A6FB0"/>')], statut: 'en vente', disponible: true, nbAttente: 0, co2: 6.4, poids: 0.2, misEnLigne: maintenant - 6, specs: { marque: '', matiere: 'Coton', largeur: null, profondeur: null, hauteur: null, teste: false }, caracteristiques: 'Pressions à l\'entrejambe.' },
    { id: 'A8', categorie: 'Vêtements', sousCategorie: 'Femme', titre: 'Pull en laine', description: 'Chaud et léger.', taille: 'M', etat: 'Bon état', prix: 8, photos: [visuel('#F1E6DC', '<path d="M120 120h160l40 60-30 20v170H110V200l-30-20z" fill="#C0784A"/>')], statut: 'en vente', disponible: true, nbAttente: 0, co2: 56.7, poids: 0.5, misEnLigne: maintenant - 7, specs: { marque: '', matiere: 'Laine', largeur: null, profondeur: null, hauteur: null, teste: false }, caracteristiques: '' });
  var conversations = [], messages = [];
  var perceuse = '<rect x="110" y="190" width="170" height="70" rx="18" fill="#2F6F9F"/><rect x="150" y="250" width="50" height="130" rx="12" fill="#2F6F9F"/><rect x="140" y="370" width="70" height="40" rx="8" fill="#17241F"/><path d="M280 215h70" stroke="#888" stroke-width="12"/>';
  var tondeuse = '<rect x="90" y="250" width="220" height="90" rx="20" fill="#3F8F4A"/><circle cx="130" cy="350" r="28" fill="#17241F"/><circle cx="270" cy="350" r="28" fill="#17241F"/><path d="M260 250L330 120" stroke="#555" stroke-width="12"/>';
  var nettoyeur = '<rect x="140" y="160" width="120" height="200" rx="20" fill="#E3B23C"/><circle cx="160" cy="370" r="22" fill="#17241F"/><circle cx="240" cy="370" r="22" fill="#17241F"/><path d="M260 200C330 200 330 300 300 330" stroke="#333" stroke-width="8" fill="none"/>';
  var outils = [
    { id: 'O1', nom: 'Perceuse-visseuse 18 V', categorie: 'Bricolage', description: 'Pour percer bois, métal et placo, et visser.', caracteristiques: '2 batteries 2 Ah, chargeur, mallette.', photos: [visuel('#E2EAF2', perceuse)], tarifJour: 9.99, tarifWeekend: 15, tarifSemaine: 39, caution: 80, consommables: [{ nom: 'Forets bois (lot)', prix: 4.5 }, { nom: 'Embouts de vissage', prix: 3 }], statut: 'disponible', etat: 'Très bon état', pris: [] },
    { id: 'O2', nom: 'Tondeuse thermique', categorie: 'Jardin', description: 'Pour pelouses jusqu\'à 800 m².', caracteristiques: 'Coupe 46 cm, bac 55 L. Plein fait au départ.', photos: [visuel('#E4F0E2', tondeuse)], tarifJour: 19.99, tarifWeekend: 29, tarifSemaine: 79, caution: 150, consommables: [], statut: 'disponible', etat: 'Bon état', pris: [] },
    { id: 'O3', nom: 'Nettoyeur haute pression', categorie: 'Nettoyage', description: 'Terrasses, voitures, façades.', caracteristiques: '130 bars, 2 buses.', photos: [visuel('#F5EEDC', nettoyeur)], tarifJour: 14.99, tarifWeekend: 22, tarifSemaine: 55, caution: 100, consommables: [{ nom: 'Détergent 1 L', prix: 6 }], statut: 'en réparation', etat: '', pris: [] }
  ];
  (function () { var d = new Date(Date.now() + 3 * J); for (var i = 0; i < 3; i++) { var x = new Date(d.getTime() + i * J); outils[0].pris.push(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0')); } })();
  var locations = [];
  function prixLoc(m, d0, d1) { var n = Math.round((d1 - d0) / J) + 1; var o = [n * m.tarifJour]; if (m.tarifSemaine) o.push(Math.floor(n / 7) * m.tarifSemaine + Math.min((n % 7) * m.tarifJour, m.tarifSemaine)); return Math.round(Math.min.apply(null, o) * 100) / 100; }
  var historique = [
    { titre: 'Manteau en laine', date: Date.now() - 40 * J, prix: 18, categorie: 'Vêtements', kg: 1.2, co2: 101.4, photo: visuel('#E5E1EE', '<rect x="120" y="90" width="160" height="320" rx="20" fill="#5B4A86"/>') },
    { titre: 'Table basse', date: Date.now() - 95 * J, prix: 25, categorie: 'Meubles', kg: 12, co2: 80.2, photo: visuel('#EFE6DA', buffet) },
    { titre: 'Jean droit', date: Date.now() - 130 * J, prix: 7, categorie: 'Vêtements', kg: 0.6, co2: 25.1, photo: visuel('#DCE3EA', veste) },
    { titre: 'Bouilloire', date: Date.now() - 200 * J, prix: 5, categorie: 'Objets', kg: 1, co2: 37.8, photo: visuel('#F5F0DF', lampe) }
  ];
  var TYPES = [['T-shirt', 'Vêtements'], ['Jean / pantalon', 'Vêtements'], ['Pull', 'Vêtements'], ['Robe', 'Vêtements'], ['Veste', 'Vêtements'], ['Manteau', 'Vêtements'], ['Vêtement (autre)', 'Vêtements'],
    ['Chaise', 'Meubles'], ['Table', 'Meubles'], ['Canapé', 'Meubles'], ['Armoire', 'Meubles'], ['Meuble (autre)', 'Meubles'], ['Bouilloire', 'Objets'], ['Micro-ondes', 'Objets'], ['Objet (autre)', 'Objets']]
    .map(function (t) { return { type: t[0], categorie: t[1] }; });
  var resas = [], attentes = [], alertes = [], dons = [];
  var animations = [
    { id: 'N1', active: true, theme: 'Noël', du: isoJ(-1), au: isoJ(30), titre: 'Noël de seconde main', texte: 'Des idées cadeaux à petit prix, choisies par l\'équipe.', bouton: 'Voir les idées cadeaux', lien: 'Idée cadeau', image: '' },
    { id: 'N2', active: true, theme: 'Carnaval', du: isoJ(90), au: isoJ(105), titre: 'C\'est le Carnaval à Bailleul !', texte: 'Déguisements et accessoires pour défiler.', bouton: 'Se déguiser', lien: 'Vêtements', image: '' },
    { id: 'N3', active: false, theme: 'Rentrée', du: '', au: '', titre: 'Rentrée futée', texte: 'Cartables et vêtements enfants à prix doux.', bouton: 'Voir', lien: 'À la une', image: '' }
  ];
  var THEMES = ['Classique', 'Noël', 'Hiver', 'Saint-Valentin', 'Carnaval', 'Printemps', 'Fête des mères', 'Été', 'Rentrée', 'Automne', 'Halloween', 'Bonnes affaires'];
  var config = {
    nomApp: 'Bailleul Super Bon Plan', nomEbe: 'EBE de Bailleul (démo)', telephone: '03 00 00 00 00', emailContact: 'contact@exemple.fr',
    delaiJours: 7, maxReservations: 3, delaiOffreHeures: 24,
    point: { nom: 'Point de collecte (démo)', adresse: 'Grand-Place, 59270 Bailleul', horaires: 'Du mardi au samedi, 9h–12h et 14h–18h' },
    joursOuverture: ['mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], creneaux: ['Matin (9h–12h)', 'Après-midi (14h–18h)'],
    categories: ['Vêtements', 'Objets', 'Meubles'], etiquettes: ['Coup de cœur', 'Idée cadeau', 'Petit prix', 'Pièce rare', 'Nouveauté'],
    messageAccueil: 'Des pièces choisies par l\'équipe, à réserver ici et à retirer près de chez vous.',
    presentation: 'Chaque article est collecté, trié, nettoyé et photographié par les salariés de l\'Entreprise à But d\'Emploi, qui crée des emplois utiles au territoire.',
    maxAlertes: 10, dons: { actifs: true, modes: ['Je l\'apporte au point de collecte', 'Collecte à domicile (gros meubles)'], texte: 'Vêtements propres, objets en état de marche, meubles en bon état. L\'équipe vous répond sous quelques jours.' },
    impact: { articles: 312, kg: 1248, co2: 9870 },
    typesCO2: TYPES, equivalences: { voitureKgParKm: 0.142, empreinteFrancaisKg: 9100, source: 'ADEME, Impact CO2' },
    notificationsPush: false,
    points: [
      { nom: 'La Recycle\'Rit', adresse: '2379 route de la Blanche, 59270 Bailleul', horaires: 'Lundi, mardi, mercredi et vendredi : 9h-12h30 et 13h30-18h ; jeudi : 10h30-12h30 et 13h30-18h ; samedi : 9h-12h30 et 13h30-17h', telephone: '03 28 00 00 00', jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], vente: true, volumineux: true, location: true },
      { nom: 'Au trésor de Melusine', adresse: '29 rue d\'Occident, 59270 Bailleul', horaires: '[horaires à compléter]', jours: [], vente: true, volumineux: false, location: false },
      { nom: 'Au passage', adresse: 'Gare SNCF, 59270 Bailleul', horaires: 'Lundi, mardi, mercredi et vendredi : 6h-14h et 15h30-19h ; jeudi : 6h-19h', jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'], vente: true, volumineux: false, location: false },
      { nom: 'La repasserie', adresse: '457 petite verte rue, 59270 Bailleul', horaires: '[horaires à compléter]', jours: [], vente: true, volumineux: false, location: false }
    ],
    categoriesVolumineuses: ['Meubles'], delaiPreparationJours: 1, delaiPreparationHeures: 24,
    profil: { ages: ['Moins de 25 ans', '25 à 39 ans', '40 à 59 ans', '60 ans et plus'], communes: ['Bailleul', 'Méteren', 'Saint-Jans-Cappel', 'Steenwerck', 'Nieppe', 'Autre commune'], connu: ['Bouche-à-oreille', 'En boutique', 'Réseaux sociaux', 'Affiche', 'Autre'] },
    urlConditions: 'https://example.com',
    location: { active: true, categories: ['Bricolage', 'Jardin', 'Nettoyage', 'Déménagement'], dureeMax: 14, horizon: 60,
      conditions: 'Pièce d\'identité et caution demandées au retrait. Le prix est réglé au retrait, la caution est rendue au retour si le matériel revient en bon état et propre.', caution: 'Chèque ou espèces, rendu au retour' },
    familles: [['canape', 'sofa', 'banquette', 'fauteuil', 'divan', 'clic-clac', 'convertible'], ['chaise', 'tabouret', 'siege', 'assise', 'banc'],
      ['veste', 'blouson', 'manteau', 'parka', 'doudoune'], ['pull', 'gilet', 'sweat', 'cardigan'], ['armoire', 'commode', 'buffet', 'bahut', 'etagere'],
      ['lampe', 'luminaire', 'lampadaire', 'applique', 'abat-jour'], ['vaisselle', 'assiette', 'bol', 'tasse', 'theiere', 'plat']],
    delaiReponse: 'L\'équipe répond en général sous 24 h, du mardi au samedi.',
    referentiel: {
      sousCategories: [['Vêtements', 'Femme', 'Adulte'], ['Vêtements', 'Homme', 'Adulte'], ['Vêtements', 'Enfant', 'Enfant'], ['Vêtements', 'Chaussures', 'Pointures'], ['Vêtements', 'Accessoires', ''],
        ['Meubles', 'Salon', 'Largeur'], ['Meubles', 'Chambre', 'Largeur'], ['Meubles', 'Cuisine', 'Largeur'], ['Meubles', 'Rangement', 'Largeur'],
        ['Objets', 'Électroménager', ''], ['Objets', 'Vaisselle', ''], ['Objets', 'Déco', ''], ['Objets', 'Jouets', ''], ['Objets', 'Livres', '']].map(function (x) { return { categorie: x[0], nom: x[1], grille: x[2] }; }),
      grilles: {
        Adulte: { type: 'liste', valeurs: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54'] },
        Enfant: { type: 'liste', valeurs: ['Naissance', '1 mois', '3 mois', '6 mois', '9 mois', '12 mois', '18 mois', '24 mois', '3 ans', '4 ans', '5 ans', '6 ans', '8 ans', '10 ans', '12 ans', '14 ans', '16 ans'] },
        Pointures: { type: 'liste', valeurs: ['16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48'] },
        Largeur: { type: 'largeur', valeurs: ['50', '80', '120', '160'] }
      }
    }, lienTelechargement: 'https://exemple.fr/bonplan',
    messageInvitation: 'J\'utilise l\'appli Bailleul Super Bon Plan pour trouver des vêtements, objets et meubles de seconde main à petits prix, près de chez nous. Télécharge-la ici :',
    urlPartage: 'https://example.com/?page=article&id=', urlConfidentialite: 'https://example.com'
  };
  var reglages = { message_accueil: config.messageAccueil, point_collecte_nom: config.point.nom, point_collecte_adresse: config.point.adresse, point_collecte_horaires: config.point.horaires,
    telephone_ebe: config.telephone, jours_ouverture: config.joursOuverture.join(', '), creneaux: config.creneaux.join(', '), delai_reponse: config.delaiReponse, presentation_ebe: config.presentation };
  var utilisateur = { email: 'demo@exemple.fr', prenom: 'Camille', nom: '', telephone: '06 00 00 00 00', role: 'admin', conditionsOk: true, age: '', commune: '', connu: '', urlSuivi: 'https://docs.google.com/spreadsheets/', bloqueJusqua: 0, tailles: [], messagerieBloquee: false, impact: { articles: 4, kg: 14.8, co2: 244.5 } };

  function cle(t) { return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-'); }
  function animationDuJour() {
    var auj = isoJ(0);
    var act = animations.filter(function (n) { return n.active && (!n.du || n.du <= auj) && (!n.au || n.au >= auj); });
    return {
      theme: cle((act[0] && act[0].theme) || 'Classique'),
      bandeaux: act.filter(function (n) { return n.titre; }).map(function (n) {
        var l = n.lien === 'À la une' ? { type: 'une' } : config.categories.indexOf(n.lien) >= 0 ? { type: 'categorie', valeur: n.lien } : config.etiquettes.indexOf(n.lien) >= 0 ? { type: 'etiquette', valeur: n.lien } : n.lien ? { type: 'recherche', valeur: n.lien } : null;
        return { id: n.id, theme: cle(n.theme), titre: n.titre, texte: n.texte, bouton: n.bouton, lien: l, image: n.imageData || n.image, remise: Number(n.remise) || 0, remiseSur: n.remiseSur || '', popup: !!n.popup };
      })
    };
  }
  function ok(d) { return new Promise(function (r) { setTimeout(function () { r({ ok: true, data: JSON.parse(JSON.stringify(d)) }); }, 200); }); }
  function ko(m) { return new Promise(function (r) { setTimeout(function () { r({ ok: false, error: m }); }, 200); }); }
  function code() { var a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', c = 'BP-'; for (var i = 0; i < 4; i++) c += a[Math.floor(Math.random() * a.length)]; return c; }
  function art(id) {
    var a = articles.filter(function (x) { return x.id === id; })[0];
    if (a) return a;
    var o = (typeof outils !== 'undefined' ? outils : []).filter(function (x) { return x.id === id; })[0];
    return o ? { id: o.id, titre: o.nom, photos: o.photos, prix: o.tarifJour, statut: 'en location' } : undefined;
  }
  function setStatut(a, s) { a.statut = s; a.disponible = s === 'en vente'; }

  window.BSBP_DEMO = function (r) {
    switch (r.action) {
      case 'config': config.animation = animationDuJour(); return ok(config);
      case 'demarrage': config.animation = animationDuJour(); return ok(r.jeton ? { config: config, moi: utilisateur, alertes: alertes, attentes: attentes, nonLus: conversations.filter(function (c) { return c.nonLuClient; }).length, nonLusEquipe: conversations.filter(function (c) { return c.nonLuEquipe; }).length } : { config: config, moi: null });
      case 'equipeReglages': return ok(Object.keys(reglages).map(function (k) { return { cle: k, valeur: reglages[k], aide: '' }; }));
      case 'equipeSauverReglages': Object.keys(r.valeurs).forEach(function (k) { if (k in reglages) reglages[k] = r.valeurs[k]; }); config.messageAccueil = reglages.message_accueil; config.point.nom = reglages.point_collecte_nom; config.point.adresse = reglages.point_collecte_adresse; config.point.horaires = reglages.point_collecte_horaires; config.telephone = reglages.telephone_ebe; config.delaiReponse = reglages.delai_reponse; config.presentation = reglages.presentation_ebe;
        return ok(Object.keys(reglages).map(function (k) { return { cle: k, valeur: reglages[k], aide: '' }; }));
      case 'articles': return ok({ version: 'demo', articles: articles.filter(function (a) { return ['en vente', 'réservé', 'proposé'].indexOf(a.statut) >= 0; }) });
      case 'article': return ok(art(r.id));
      case 'demanderCode': return ok({ envoye: true });
      case 'verifierCode': return r.code === '123456' ? ok({ jeton: 'demo', utilisateur: Object.assign(utilisateur, { email: r.email }) }) : ko('Code incorrect. En démo, le code est 123456.');
      case 'moi': return ok(utilisateur);
      case 'deconnexion': case 'supprimerCompte': return ok({});
      case 'reserver': {
        var a = art(r.idArticle);
        if (!a || (a.statut !== 'en vente' && a.statut !== 'proposé')) return ko('Trop tard : cet article vient d\'être réservé par quelqu\'un d\'autre. Vous pouvez rejoindre la liste d\'attente.');
        if (resas.filter(function (x) { return x.statut === 'active'; }).length >= 3) return ko('Vous avez déjà 3 réservations en cours.');
        setStatut(a, 'réservé');
        attentes = attentes.filter(function (w) { return w.article.id !== a.id; });
        var lim = new Date(Date.now() + 7 * J); lim.setHours(23, 59, 0, 0);
        var cr = '';
        if (r.creneau && r.creneau.date) { var d = new Date(r.creneau.date + 'T12:00'); cr = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][d.getDay()] + ' ' + d.getDate() + (r.creneau.moment ? ', ' + r.creneau.moment : ''); }
        var resa = { point: r.point || 'La Recycle\'Rit', code: code(), numero: 'R' + Date.now(), article: a, limite: lim.getTime(), reserveLe: Date.now(), statut: 'active', creneau: cr, prenom: utilisateur.prenom, telephone: utilisateur.telephone, emplacement: 'Étagère B2' };
        resas.unshift(resa); return ok(resa);
      }
      case 'mesResas': return ok({ achats: { reservations: resas, attentes: attentes }, locations: locations });
      case 'mesReservations': return ok({ reservations: resas, attentes: attentes });
      case 'changerCreneau': { var x0 = resas.filter(function (y) { return y.code === r.code; })[0]; var d2 = new Date(r.creneau.date + 'T12:00'); x0.creneau = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][d2.getDay()] + ' ' + d2.getDate() + (r.creneau.moment ? ', ' + r.creneau.moment : ''); return ok({ creneau: x0.creneau }); }
      case 'rejoindreAttente': {
        var b = art(r.idArticle);
        if (attentes.some(function (w) { return w.article.id === b.id; })) return ko('Vous êtes déjà sur la liste d\'attente de cet article.');
        b.nbAttente++;
        attentes.push({ id: 'W' + Date.now(), statut: 'en attente', rang: b.nbAttente, article: b, offreJusqua: 0 });
        // Pour la démo : l'article se libère 4 secondes plus tard et vous est proposé.
        setTimeout(function () { var w = attentes.filter(function (x) { return x.article.id === b.id; })[0]; if (w) { w.statut = 'proposé'; w.rang = 0; w.offreJusqua = Date.now() + 24 * 3600000; setStatut(b, 'proposé');
          if (window.BSBP_BANNIERE) window.BSBP_BANNIERE('Il s\'est libéré pour vous !', '« ' + b.titre + ' » vous est réservé jusqu\'à demain. Touchez pour le confirmer.', { type: 'offre', idArticle: b.id }); } }, 4000);
        return ok({ rang: b.nbAttente });
      }
      case 'quitterAttente': { attentes = attentes.filter(function (w) { return w.id !== r.id; }); return ok({}); }
      case 'mesAlertes': return ok(alertes);
      case 'creerAlerte': {
        var al = { id: 'L' + Date.now(), motsCles: r.alerte.motsCles || '', categorie: r.alerte.categorie || '', taille: r.alerte.taille || '', prixMax: r.alerte.prixMax ? Number(String(r.alerte.prixMax).replace(',', '.')) : null, active: true, nbEnvois: 0 };
        if (!al.motsCles && !al.categorie && !al.taille && al.prixMax == null) return ko('Indiquez au moins un critère : un mot, une catégorie, une taille ou un prix.');
        alertes.push(al); return ok(al);
      }
      case 'supprimerAlerte': alertes = alertes.filter(function (a) { return a.id !== r.id; }); return ok({});
      case 'proposerDon': dons.unshift({ id: 'D' + Date.now(), date: Date.now(), categorie: r.don.categorie, description: r.don.description, photos: r.photos, mode: r.don.mode, adresse: r.don.adresse, statut: 'nouveau', reponse: '', prenom: utilisateur.prenom, telephone: r.don.telephone }); return ok({});
      case 'mesDons': case 'equipeDons': return ok(dons);
      case 'enregistrerAppareil': case 'oublierAppareil': return ok({});
      case 'enregistrerTailles': utilisateur.tailles = (r.tailles || []).slice(); return ok({ tailles: utilisateur.tailles });
      case 'mesConversations': case 'equipeConversations': return ok(conversations.slice().sort(function (x, y) { return y.dernier - x.dernier; }));
      case 'lireConversation': case 'equipeLireConversation': {
        var eq = r.action === 'equipeLireConversation';
        var cv = r.id ? conversations.filter(function (x) { return x.id === r.id; })[0] : conversations.filter(function (x) { return x.idArticle === r.idArticle; })[0];
        var ctx = function (idA) { var rs = resas.filter(function (x) { return x.article.id === idA && x.statut === 'active'; })[0]; return rs ? { code: rs.code, statut: 'active', limite: rs.limite, creneau: rs.creneau } : null; };
        if (!cv) { var ar = art(r.idArticle); return ok({ conversation: null, article: ar, messages: [], delaiReponse: config.delaiReponse, reservation: ctx(r.idArticle), client: { prenom: utilisateur.prenom, email: utilisateur.email, telephone: utilisateur.telephone, bloque: false } }); }
        if (eq) cv.nonLuEquipe = false; else cv.nonLuClient = false;
        return ok({ conversation: cv, article: cv.article, messages: messages.filter(function (m) { return m.conv === cv.id; }), delaiReponse: config.delaiReponse, reservation: ctx(cv.idArticle), client: { prenom: utilisateur.prenom, email: utilisateur.email, telephone: utilisateur.telephone, bloque: false } });
      }
      case 'envoyerMessage': case 'equipeRepondre': {
        var eq2 = r.action === 'equipeRepondre';
        var cv2 = r.id ? conversations.filter(function (x) { return x.id === r.id; })[0] : conversations.filter(function (x) { return x.idArticle === r.idArticle; })[0];
        if (!cv2) { var ar2 = art(r.idArticle); cv2 = { id: 'C' + Date.now(), idArticle: ar2.id, titre: ar2.titre, article: ar2, prenom: utilisateur.prenom, email: utilisateur.email, dernier: Date.now(), extrait: '', nonLuClient: false, nonLuEquipe: true }; conversations.push(cv2); }
        messages.push({ id: 'M' + Date.now(), conv: cv2.id, date: Date.now(), auteur: eq2 ? 'équipe' : 'client', texte: r.texte || '', photo: r.photo || '', prenom: eq2 ? 'Camille' : '' });
        cv2.dernier = Date.now(); cv2.extrait = r.texte; cv2.nonLuEquipe = !eq2; cv2.nonLuClient = eq2;
        if (eq2) cv2.nonLuEquipe = false;
        if (!eq2 && messages.filter(function (m) { return m.conv === cv2.id; }).length === 1) {
          // Démo : l'équipe répond au bout de quelques secondes.
          setTimeout(function () {
            messages.push({ id: 'M' + Date.now(), conv: cv2.id, date: Date.now(), auteur: 'équipe', texte: 'Bonjour ! Oui, il est toujours disponible. Vous pouvez le réserver dans l\'app, on vous le met de côté.', prenom: 'Karim' });
            cv2.dernier = Date.now(); cv2.extrait = 'Bonjour ! Oui, il est toujours disponible.'; cv2.nonLuClient = true;
            if (window.BSBP_BANNIERE) window.BSBP_BANNIERE('Réponse de l\'équipe', cv2.titre + ' : Bonjour ! Oui, il est toujours disponible.', { type: 'message', id: cv2.id });
          }, 3500);
        }
        return window.BSBP_DEMO({ action: eq2 ? 'equipeLireConversation' : 'lireConversation', id: cv2.id });
      }
      case 'signalerMessage': messages.forEach(function (m) { if (m.id === r.id) m.signale = true; }); return ok({});
      case 'equipeBloquer': return ok({});
      case 'materiel': return ok(outils);
      case 'outil': return ok(outils.filter(function (o) { return o.id === r.id; })[0]);
      case 'reserverLocation': {
        var o = outils.filter(function (x) { return x.id === r.idMateriel; })[0];
        var d0 = new Date(r.debut + 'T12:00'), d1 = new Date(r.fin + 'T12:00');
        var px = prixLoc(o, d0, d1) + (r.consommables || []).reduce(function (s1, n) { var c = o.consommables.filter(function (y) { return y.nom === n; })[0]; return s1 + (c ? c.prix : 0); }, 0);
        for (var t0 = new Date(d0.getTime()); t0 <= d1; t0 = new Date(t0.getTime() + J)) o.pris.push(t0.getFullYear() + '-' + String(t0.getMonth() + 1).padStart(2, '0') + '-' + String(t0.getDate()).padStart(2, '0'));
        var lo = { code: 'LO-' + code().slice(3), statut: 'réservée', idOutil: o.id, nom: o.nom, photo: o.photos[0], debut: d0.getTime(), fin: d1.getTime(), moment: r.moment || '', prix: Math.round(px * 100) / 100, caution: o.caution, consommables: (r.consommables || []).join(', '), prenom: utilisateur.prenom, email: utilisateur.email, telephone: utilisateur.telephone, remise: { photos: [], etat: '' }, retour: { photos: [], etat: '', dommages: '' } };
        locations.unshift(lo);
        return ok({ code: lo.code, outil: o, debut: lo.debut, fin: lo.fin, prix: lo.prix, caution: lo.caution, consommables: lo.consommables, moment: lo.moment, statut: 'réservée' });
      }
      case 'mesLocations': return ok(locations);
      case 'equipeLocations': return ok(locations.filter(function (x) { return ['réservée', 'en cours', 'en retard'].indexOf(x.statut) >= 0; }));
      case 'annulerLocation': case 'equipeAnnulerLocation': locations.forEach(function (x) { if (x.code === r.code) x.statut = 'annulée'; }); return ok({});
      case 'equipeRemise': locations.forEach(function (x) { if (x.code === r.code) { x.statut = 'en cours'; x.remise = { le: Date.now(), photos: r.photos, etat: r.etat || '', cautionRecue: r.cautionRecue }; } }); return ok({});
      case 'equipeRetour': locations.forEach(function (x) { if (x.code === r.code) { x.statut = 'rendue'; x.retour = { le: Date.now(), photos: r.photos, etat: r.etat || '', dommages: r.dommages || '', cautionRendue: r.cautionRendue }; } }); return ok({});
      case 'equipeMateriel': return ok(outils);
      case 'equipeStatutMateriel': outils.forEach(function (o) { if (o.id === r.id) o.statut = r.statut; }); return ok({});
      case 'equipeAjouterMateriel': outils.push({ id: 'O' + Date.now(), nom: r.outil.nom, categorie: r.outil.categorie, description: r.outil.description, caracteristiques: r.outil.caracteristiques, photos: r.photos, tarifJour: Number(String(r.outil.tarifJour).replace(',', '.')) || 0, tarifWeekend: Number(String(r.outil.tarifWeekend || '').replace(',', '.')) || 0, tarifSemaine: Number(String(r.outil.tarifSemaine || '').replace(',', '.')) || 0, caution: Number(r.outil.caution) || 0, consommables: [], statut: 'disponible', etat: r.outil.etat, pris: [] }); return ok({});
      case 'completerProfil': Object.assign(utilisateur, r.profil || {}); utilisateur.conditionsOk = true; return ok(utilisateur);
      case 'equipeModifierArticle': { var am = art(r.id); Object.assign(am, { titre: r.article.titre, prix: Number(String(r.article.prixSolde || r.article.prix).replace(',', '.')), prixInitial: r.article.prixSolde ? Number(String(r.article.prix).replace(',', '.')) : 0, description: r.article.description, photos: r.photos, emplacement: r.article.emplacement }); return ok({}); }
      case 'equipeModifierMateriel': outils.forEach(function (o) { if (o.id === r.id) Object.assign(o, { nom: r.outil.nom, description: r.outil.description, photos: r.photos }); }); return ok({});
      case 'equipePoints': return ok(config.points.map(function (x, i) { return Object.assign({ ligne: i + 2, actif: true, jours: (x.jours || []).join(', ') }, x); }));
      case 'equipeSauverPoints': config.points = r.points.filter(function (x) { return x.actif; }).map(function (x) { return Object.assign({}, x, { jours: String(x.jours || '').split(',').map(function (j) { return j.trim(); }).filter(String) }); }); return window.BSBP_DEMO({ action: 'equipePoints' });
      case 'syncFavoris': case 'logRecherche': return ok({});
      case 'modifierDon': dons.forEach(function (d) { if (d.id === r.id) Object.assign(d, { description: r.don.description, photos: r.photos }); }); return ok({});
      case 'annulerDon': dons.forEach(function (d) { if (d.id === r.id) d.statut = 'annulé'; }); return ok({});
      case 'equipeTableau': {
        var m12 = []; for (var k = 11; k >= 0; k--) { var dm = new Date(); dm.setDate(1); dm.setMonth(dm.getMonth() - k); m12.push({ mois: dm.toISOString().slice(0, 7), ventes: 20 + ((k * 7) % 15), ca: 180 + ((k * 53) % 160) }); }
        return ok({ calculeLe: Date.now(),
          aujourdhui: { retraitsAujourdhui: [{ nom: 'La Recycle\'Rit', nb: 3 }, { nom: 'Au passage', nb: 1 }], retraitsDemain: [{ nom: 'La Recycle\'Rit', nb: 2 }], reservationsEnCours: 9, sansCreneau: 3, finissentAujourdhui: 1, locationsARemettre: 2, locationsARecuperer: 1, retards: 0, messagesNonLus: 2, donsATraiter: 1, messagesSignales: 0 },
          ventes: { j7: { ventes: 14, ca: 132, panier: 9.4 }, j7prec: { ventes: 11, ca: 104 }, j30: { ventes: 61, ca: 548, panier: 8.98 }, j30prec: { ventes: 66, ca: 590 }, an: { ventes: 410, ca: 3620, panier: 8.8 }, depuisDebut: { ventes: 410, ca: 3620 }, tauxRetrait: 86, nonRetirees30: 4,
            parCategorie: [{ nom: 'Vêtements', nb: 38 }, { nom: 'Objets', nb: 17 }, { nom: 'Meubles', nb: 6 }], parPoint: [{ nom: 'La Recycle\'Rit', nb: 33 }, { nom: 'Au passage', nb: 15 }, { nom: 'La repasserie', nb: 9 }, { nom: 'Au trésor de Melusine', nb: 4 }], mois: m12 },
          stock: { enVente: 124, reserves: 9, valeur: 1430, nbAnciens: 18, parCategorie: [{ nom: 'Vêtements', nb: 81 }, { nom: 'Objets', nb: 31 }, { nom: 'Meubles', nb: 12 }],
            anciens: articles.slice(0, 2).map(function (a, i) { return { id: a.id, titre: a.titre, prix: a.prix, jours: 45 - i * 8, photo: a.photos[0] }; }), vitesse: [{ nom: 'Meubles', jours: 4.5 }, { nom: 'Vêtements', jours: 9.2 }, { nom: 'Objets', jours: 13 }] },
          location: { actif: true, outils: 3, enReparation: 1, locations30: 11, ca30: 196, occupation: 37, reservees: 2, top: [{ nom: 'Perceuse-visseuse 18 V', nb: 6 }, { nom: 'Tondeuse thermique', nb: 4 }] },
          clients: { total: 236, nouveaux30: 31, actifs30: 118, acheteurs: 152, parCommune: [{ nom: 'Bailleul', nb: 141 }, { nom: 'Méteren', nb: 24 }, { nom: 'Nieppe', nb: 19 }, { nom: 'Steenwerck', nb: 14 }, { nom: 'Non renseigné', nb: 38 }],
            parAge: [{ nom: '25 à 39 ans', nb: 88 }, { nom: '40 à 59 ans', nb: 71 }, { nom: '60 ans et plus', nb: 33 }, { nom: 'Moins de 25 ans', nb: 21 }], parConnu: [{ nom: 'Bouche-à-oreille', nb: 72 }, { nom: 'En boutique', nb: 54 }, { nom: 'Réseaux sociaux', nb: 41 }, { nom: 'Affiche', nb: 18 }] },
          demande: { favorisTotal: 312, topFavoris: articles.slice(0, 2).map(function (a, i) { return { id: a.id, titre: a.titre, prix: a.prix, nb: 9 - i * 3, photo: a.photos[0] }; }), favorisParCategorie: [{ nom: 'Vêtements', nb: 190 }, { nom: 'Meubles', nb: 74 }, { nom: 'Objets', nb: 48 }],
            alertesActives: 87, nbJamaisServies: 12, budgetMoyen: 24, jamaisServies: ['« poussette double »', '« vélo enfant », Objets, 20 € max', '« canapé d\'angle » et proches'],
            motsAlertes: [{ nom: 'poussette', nb: 9 }, { nom: 'velo', nb: 7 }, { nom: 'canape', nb: 6 }, { nom: 'manteau', nb: 5 }, { nom: 'lego', nb: 4 }], alertesParCategorie: [{ nom: 'Vêtements › Enfant', nb: 21 }, { nom: 'Meubles', nb: 17 }, { nom: 'Toutes', nb: 15 }],
            taillesDemandees: [{ nom: '38', nb: 9 }, { nom: 'M', nb: 8 }, { nom: '4 ans', nb: 6 }], attenteTop: [{ id: 'A3', titre: 'Lampe de chevet années 70', nb: 4 }],
            recherchesTop: [{ nom: 'jean', nb: 41 }, { nom: 'robe', nb: 33 }, { nom: 'commode', nb: 18 }], recherchesSansResultat: [{ nom: 'poussette', nb: 14 }, { nom: 'trottinette', nb: 9 }, { nom: 'lit bebe', nb: 6 }] },
          aFaire: { retraits: articles.slice(0, 2).map(function (a, i) { return { code: 'BP-K7Q' + i, titre: a.titre, prenom: ['Camille', 'Yacine'][i], creneau: i ? '' : 'aujourd\'hui matin', point: 'La Recycle\'Rit', limite: Date.now() + J, photo: a.photos[0], emplacement: 'Étagère B2' }; }),
            dons: [{ id: 'D1', description: 'Un sac de vêtements enfant 4-6 ans', prenom: 'Sophie', date: Date.now() - 3600e3, mode: 'Je l\'apporte au point de collecte', photos: [articles[0].photos[0]] }],
            messages: [{ id: 'C9', prenom: 'Marc', article: 'Commode', dernier: 'Bonjour, est-elle toujours disponible ?' }], locations: [] },
          impact: { kgMois: 74, co2Mois: 1630, kgTotal: 812, co2Total: 9870, dons: { proposes: 12, acceptes: 7 } } });
      }
      case 'envoyerRetour': return (r.retour.message || '').trim().length < 5 ? ko('Décrivez en quelques mots ce qui se passe ou ce que vous aimeriez.') : ok({ id: 'B1' });
      case 'monBilan': {
        var tot = historique.reduce(function (t, r) { t.kg += r.kg; t.co2 += r.co2; t.depense += r.prix; return t; }, { articles: historique.length, kg: 0, co2: 0, depense: 0 });
        var mois = [];
        for (var k = 11; k >= 0; k--) {
          var d0 = new Date(); d0.setDate(1); d0.setMonth(d0.getMonth() - k);
          var cle0 = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0');
          var dans = historique.filter(function (h) { var x = new Date(h.date); return x.getFullYear() === d0.getFullYear() && x.getMonth() === d0.getMonth(); });
          mois.push({ mois: cle0, articles: dans.length, co2: dans.reduce(function (s0, h) { return s0 + h.co2; }, 0) });
        }
        var pc = {};
        historique.forEach(function (h) { var e0 = pc[h.categorie] || (pc[h.categorie] = { categorie: h.categorie, articles: 0, co2: 0, kg: 0 }); e0.articles++; e0.co2 += h.co2; e0.kg += h.kg; });
        return ok({ totaux: tot, retraits: historique, mois: mois, parCategorie: Object.keys(pc).map(function (k2) { return pc[k2]; }).sort(function (x, y) { return y.co2 - x.co2; }), equivalences: config.equivalences, tauxSubstitution: 1 });
      }
      case 'equipeRepondreDon': { var dn = dons.filter(function (x) { return x.id === r.id; })[0]; dn.statut = r.statut; if (r.message) dn.reponse = r.message; return ok(dn); }
      case 'equipeReservations': return ok(resas.filter(function (x) { return x.statut === 'active'; }));
      case 'annulerReservation': case 'equipeAnnuler': case 'equipeValiderRetrait': {
        var c = String(r.code).toUpperCase(); if (c.indexOf('BP-') !== 0) c = 'BP-' + c;
        var x = resas.filter(function (y) { return y.code === c; })[0];
        if (!x || x.statut !== 'active') return ko('Aucune réservation en cours avec le code ' + c + '.');
        var fin = r.action === 'equipeValiderRetrait';
        x.statut = fin ? 'retirée' : 'annulée'; setStatut(x.article, fin ? 'vendu' : 'en vente');
        if (fin) { utilisateur.impact.articles++; utilisateur.impact.kg += x.article.poids || 0; }
        return ok({ code: c, article: x.article.titre });
      }
      case 'equipeArticles': return ok(articles);
      case 'equipeChangerStatut': { var e = art(r.idArticle); if (e) setStatut(e, r.statut); return ok({}); }
      case 'equipeMettreEnAvant': { var f = art(r.idArticle); f.aLaUne = r.aLaUne; f.etiquette = r.etiquette; return ok({}); }
      case 'equipeAnimations': return ok({ themes: THEMES, animations: animations, enCours: animationDuJour() });
      case 'equipeSauverAnimation': {
        var n = r.animation;
        if (n.id) animations = animations.map(function (x) { return x.id === n.id ? n : x; }); else { n.id = 'N' + Date.now(); animations.push(n); }
        return ok({ themes: THEMES, animations: animations, enCours: animationDuJour() });
      }
      case 'equipeSupprimerAnimation': animations = animations.filter(function (x) { return x.id !== r.id; }); return ok({});
      case 'equipeAjouterArticle': {
        var g = { id: 'A' + Date.now(), categorie: r.article.categorie, titre: r.article.titre, description: r.article.description, taille: r.article.taille, etat: r.article.etat, prix: Number(String(r.article.prix).replace(',', '.')) || 0, photos: r.photos, statut: 'en vente', disponible: true, aLaUne: r.article.aLaUne, etiquette: r.article.etiquette, preparePar: r.article.preparePar || 'Camille', poids: Number(r.article.poids) || 1, sousCategorie: r.article.sousCategorie || '', caracteristiques: r.article.caracteristiques || '', specs: { marque: r.article.marque || '', matiere: r.article.matiere || '', largeur: Number(r.article.largeur) || null, profondeur: Number(r.article.profondeur) || null, hauteur: Number(r.article.hauteur) || null, teste: !!r.article.teste }, co2: 6.4, emplacement: r.article.emplacement, misEnLigne: Date.now(), nbAttente: 0 };
        articles.unshift(g); return ok({ id: g.id });
      }
      default: return ko('Action non disponible en démo.');
    }
  };
})();
