// Einstiegspunkt der Web-App. Baut die Oberfläche auf; der Editor folgt in den nächsten Schritten.

const $ = (id) => document.getElementById(id);

// Seitenleiste und Menü auf schmalen Bildschirmen ein- und ausklappen
$('sidebar-toggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));
$('menu-toggle').addEventListener('click', () => $('menubar').classList.toggle('open'));
