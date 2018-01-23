$(document).ready(function () {
    $("body").show();
	adjustFooter();
	$(window).resize(function () {
		adjustFooter();
	});
});

function adjustFooter() {
    if ($("footer").offset().top + $("footer").height() < window.innerHeight) {
		var topPos = window.innerHeight - $("footer").height();
		$("footer").css('position', 'absolute');
		$("footer").css('width', '100%');
		$("footer").css('top', topPos + 'px');
	}
}
