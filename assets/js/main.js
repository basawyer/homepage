// Tiny scroll-reveal, no dependencies.
document.addEventListener("DOMContentLoaded", function () {
  var targets = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || !targets.length) {
    targets.forEach(function (el) { el.classList.add("in"); });
    return;
  }
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  targets.forEach(function (el) { io.observe(el); });

  // Highlight current section in nav while scrolling the homepage.
  var sections = document.querySelectorAll("main section[id]");
  var navLinks = document.querySelectorAll("nav.site-nav a[data-section]");
  if (!sections.length || !navLinks.length) return;
  var byId = {};
  navLinks.forEach(function (a) { byId[a.getAttribute("data-section")] = a; });
  var navObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        var link = byId[entry.target.id];
        if (!link) return;
        if (entry.isIntersecting) {
          navLinks.forEach(function (a) { a.classList.remove("current"); });
          link.classList.add("current");
        }
      });
    },
    { rootMargin: "-45% 0px -45% 0px" }
  );
  sections.forEach(function (s) { navObserver.observe(s); });
});
