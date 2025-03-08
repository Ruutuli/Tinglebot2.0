$(function() {
	"use strict";
	if ($(".app-container").length) {
		new PerfectScrollbar(".app-container");
	}
	if ($(".header-message-list").length) {
		new PerfectScrollbar(".header-message-list");
	}
	if ($(".header-notifications-list").length) {
		new PerfectScrollbar(".header-notifications-list");
	}
	


	    $(".mobile-search-icon").on("click", function() {
			$(".search-bar").addClass("full-search-bar")
		}),

		$(".search-close").on("click", function() {
			$(".search-bar").removeClass("full-search-bar")
		}),

		$(".mobile-toggle-menu").on("click", function() {
			$(".wrapper").addClass("toggled")
		}),
		



		$(".dark-mode").on("click", function() {

			if($(".dark-mode-icon i").attr("class") == 'bx bx-sun') {
				$(".dark-mode-icon i").attr("class", "bx bx-moon");
				$("html").attr("class", "light-theme")
			} else {
				$(".dark-mode-icon i").attr("class", "bx bx-sun");
				$("html").attr("class", "dark-theme")
			}

		}), 

		
		$(".toggle-icon").click(function() {
			$(".wrapper").hasClass("toggled") ? ($(".wrapper").removeClass("toggled"), $(".sidebar-wrapper").unbind("hover")) : ($(".wrapper").addClass("toggled"), $(".sidebar-wrapper").hover(function() {
				$(".wrapper").addClass("sidebar-hovered")
			}, function() {
				$(".wrapper").removeClass("sidebar-hovered")
			}))
		}),
		$(document).ready(function() {
			$(window).on("scroll", function() {
				$(this).scrollTop() > 300 ? $(".back-to-top").fadeIn() : $(".back-to-top").fadeOut()
			}), $(".back-to-top").on("click", function() {
				return $("html, body").animate({
					scrollTop: 0
				}, 600), !1
			})
		}),
		
		$(function() {
			for (var e = window.location, o = $(".metismenu li a").filter(function() {
					return this.href == e
				}).addClass("").parent().addClass("mm-active"); o.is("li");) o = o.parent("").addClass("mm-show").parent("").addClass("mm-active")
		}),
		
		
		$(function() {
			$("#menu").metisMenu()
		}), 
		
		$(".chat-toggle-btn").on("click", function() {
			$(".chat-wrapper").toggleClass("chat-toggled")
		}), $(".chat-toggle-btn-mobile").on("click", function() {
			$(".chat-wrapper").removeClass("chat-toggled")
		}),


		$(".email-toggle-btn").on("click", function() {
			$(".email-wrapper").toggleClass("email-toggled")
		}), $(".email-toggle-btn-mobile").on("click", function() {
			$(".email-wrapper").removeClass("email-toggled")
		}), $(".compose-mail-btn").on("click", function() {
			$(".compose-mail-popup").show()
		}), $(".compose-mail-close").on("click", function() {
			$(".compose-mail-popup").hide()
		}), 
		
		
		$(".switcher-btn").on("click", function() {
			$(".switcher-wrapper").toggleClass("switcher-toggled")
		}), $(".close-switcher").on("click", function() {
			$(".switcher-wrapper").removeClass("switcher-toggled")
		}), $("#lightmode").on("click", function() {
			$("html").attr("class", "light-theme")
		}), $("#darkmode").on("click", function() {
			$("html").attr("class", "dark-theme")
		}), $("#semidark").on("click", function() {
			$("html").attr("class", "semi-dark")
		}), $("#minimaltheme").on("click", function() {
			$("html").attr("class", "minimal-theme")
		}), $("#headercolor1").on("click", function() {
			$("html").addClass("color-header headercolor1"), $("html").removeClass("headercolor2 headercolor3 headercolor4 headercolor5 headercolor6 headercolor7 headercolor8")
		}), $("#headercolor2").on("click", function() {
			$("html").addClass("color-header headercolor2"), $("html").removeClass("headercolor1 headercolor3 headercolor4 headercolor5 headercolor6 headercolor7 headercolor8")
		}), $("#headercolor3").on("click", function() {
			$("html").addClass("color-header headercolor3"), $("html").removeClass("headercolor1 headercolor2 headercolor4 headercolor5 headercolor6 headercolor7 headercolor8")
		}), $("#headercolor4").on("click", function() {
			$("html").addClass("color-header headercolor4"), $("html").removeClass("headercolor1 headercolor2 headercolor3 headercolor5 headercolor6 headercolor7 headercolor8")
		}), $("#headercolor5").on("click", function() {
			$("html").addClass("color-header headercolor5"), $("html").removeClass("headercolor1 headercolor2 headercolor4 headercolor3 headercolor6 headercolor7 headercolor8")
		}), $("#headercolor6").on("click", function() {
			$("html").addClass("color-header headercolor6"), $("html").removeClass("headercolor1 headercolor2 headercolor4 headercolor5 headercolor3 headercolor7 headercolor8")
		}), $("#headercolor7").on("click", function() {
			$("html").addClass("color-header headercolor7"), $("html").removeClass("headercolor1 headercolor2 headercolor4 headercolor5 headercolor6 headercolor3 headercolor8")
		}), $("#headercolor8").on("click", function() {
			$("html").addClass("color-header headercolor8"), $("html").removeClass("headercolor1 headercolor2 headercolor4 headercolor5 headercolor6 headercolor7 headercolor3")
		})
		
	// sidebar colors 
	$('#sidebarcolor1').click(theme1);
	$('#sidebarcolor2').click(theme2);
	$('#sidebarcolor3').click(theme3);
	$('#sidebarcolor4').click(theme4);
	$('#sidebarcolor5').click(theme5);
	$('#sidebarcolor6').click(theme6);
	$('#sidebarcolor7').click(theme7);
	$('#sidebarcolor8').click(theme8);

	function theme1() {
		$('html').attr('class', 'color-sidebar sidebarcolor1');
	}

	function theme2() {
		$('html').attr('class', 'color-sidebar sidebarcolor2');
	}

	function theme3() {
		$('html').attr('class', 'color-sidebar sidebarcolor3');
	}

	function theme4() {
		$('html').attr('class', 'color-sidebar sidebarcolor4');
	}

	function theme5() {
		$('html').attr('class', 'color-sidebar sidebarcolor5');
	}

	function theme6() {
		$('html').attr('class', 'color-sidebar sidebarcolor6');
	}

	function theme7() {
		$('html').attr('class', 'color-sidebar sidebarcolor7');
	}

	function theme8() {
		$('html').attr('class', 'color-sidebar sidebarcolor8');
	}
	
	
});

// ------------------- Load JSON Files into Dropdown -------------------
function loadJsonDropdown() {
    $.getJSON('http://127.0.0.1:5000/api/json-files', function(jsonFiles) {
        const $menu = $("#internal-jsons-menu");
        $menu.empty(); // Clear existing list

        jsonFiles.forEach(file => {
            const listItem = `<li><a href="#" class="json-item" data-file="${file}">${file}</a></li>`;
            $menu.append(listItem);
        });

        // Click event to load JSON content when clicked
        $(".json-item").on("click", function(e) {
            e.preventDefault();
            const fileName = $(this).data("file");
            window.location.href = `internal-data.html?file=${fileName}`;
        });        
    }).fail(function() {
        console.error("❌ Failed to fetch JSON file list.");
    });
}

// ------------------- Load JSON Data for Internal Data Page -------------------
function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

$(document).ready(function () {
    loadJsonDropdown();

    // Check if on internal-data.html and load JSON file
    if (window.location.pathname.includes("internal-data.html")) {
        let fileName = getQueryParam("file");

        if (!fileName || !fileName.endsWith(".json")) {
            $("#loading").text("Invalid file request.");
        } else {
            $.getJSON(`http://127.0.0.1:5000/api/json-files/${fileName}`)
                .done(function (data) {
                    $("#loading").hide();
                    renderAccordion(data, fileName);
                })
                .fail(function () {
                    $("#loading").text("❌ Failed to load JSON data.");
                });
        }
    }
});

// ------------------- Render Data in Accordion Format -------------------
function renderAccordion(data, fileName) {
    const $container = $("#accordion-container");
    $container.empty();

    let processedData = typeof data === "object" ? Object.entries(data) : [];

    if (processedData.length > 0) {
        processedData.forEach(([id, item], index) => {
            let headers = Object.keys(item);
            let contentHtml = headers.map(header =>
                `<p><strong>${header}:</strong> ${JSON.stringify(item[header], null, 2)}</p>`
            ).join("");

            let secondaryTitle = item.characterName || item.weaponName || item.monster || item.name || "Unknown";
            let accordionTitle = `${id} - ${secondaryTitle}`;

            let accordionItem = `
                <div class="accordion-item">
                    <h2 class="accordion-header" id="heading${index}">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${index}" aria-expanded="false" aria-controls="collapse${index}">
                            ${accordionTitle}
                        </button>
                    </h2>
                    <div id="collapse${index}" class="accordion-collapse collapse" aria-labelledby="heading${index}" data-bs-parent="#accordion-container">
                        <div class="accordion-body">
                            ${contentHtml}
                            <div class="d-flex justify-content-end mt-3">
                                <button class="btn btn-primary btn-sm edit-entry" data-id="${id}" data-file="${fileName}">Edit</button>
                                <button class="btn btn-danger btn-sm delete-entry ms-2" data-id="${id}" data-file="${fileName || getQueryParam('file')}">Delete</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            $container.append(accordionItem);
        });

        // Attach event listeners
        $(".edit-entry").on("click", function () {
            let itemId = $(this).data("id");
            let file = $(this).data("file");
            openEditModal(itemId, data[itemId], file);
        });

        $(".delete-entry").on("click", function () {
            let itemId = $(this).data("id");
            let file = $(this).data("file");
            deleteEntry(itemId, file);
        });
    }
}

// ------------------- Open Edit Modal -------------------
function openEditModal(itemId, itemData, fileName) {
    $("#editEntryModal").modal("show");
    $("#editItemId").val(itemId);
    $("#editFileName").val(fileName);

    let $fieldsContainer = $("#editFields");
    $fieldsContainer.empty();

    Object.entries(itemData).forEach(([key, value]) => {
        let inputType = typeof value === "number" ? "number" : "text";
        let valueStr = JSON.stringify(value, null, 2).replace(/"/g, "");

        let field = `
            <div class="mb-3">
                <label for="${key}" class="form-label">${key}</label>
                <input type="${inputType}" class="form-control" id="${key}" name="${key}" value="${valueStr}">
            </div>
        `;
        $fieldsContainer.append(field);
    });
}

// ------------------- Handle Edit Form Submission -------------------
$("#editEntryForm").submit(function (event) {
    event.preventDefault();

    let itemId = $("#editItemId").val();
    let fileName = $("#editFileName").val();
    let updatedData = {};

    $("#editFields input").each(function () {
        let key = $(this).attr("name");
        let value = $(this).val();
        updatedData[key] = isNaN(value) ? value : Number(value);
    });

    $.ajax({
        url: `http://127.0.0.1:5000/api/json-files/${fileName}/${itemId}`,
        type: "PUT",
        contentType: "application/json",
        data: JSON.stringify(updatedData),
        success: function () {
            alert("Entry updated successfully!");
            $("#editEntryModal").modal("hide");
            location.reload();
        },
        error: function () {
            alert("Failed to update entry.");
        }
    });
});

// ------------------- Handle Delete Entry -------------------
function deleteEntry(itemId, fileName) {
    if (!fileName) {
        fileName = getQueryParam("file");  // Fallback to URL parameter if undefined
    }

    if (!fileName) {
        alert("Error: Could not determine the JSON file.");
        return;
    }

    if (!confirm(`Are you sure you want to delete entry ${itemId}?`)) return;

    $.ajax({
        url: `http://127.0.0.1:5000/api/json-files/${fileName}/${itemId}`,
        type: "DELETE",
        success: function () {
            alert(`Entry ${itemId} deleted successfully!`);
            location.reload();
        },
        error: function (xhr) {
            alert(`Failed to delete entry ${itemId}. Server response: ${xhr.responseText}`);
        }
    });
}



