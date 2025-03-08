document.addEventListener("DOMContentLoaded", async function () {
    // ------------------- UI Elements -------------------
    const totalMembersElement = document.getElementById("total-members");
    const onlineCountElement = document.getElementById("online-count");
    const offlineCountElement = document.getElementById("offline-count");
    const idleCountElement = document.getElementById("idle-count");
    const dndCountElement = document.getElementById("dnd-count");
    const membersListElement = document.getElementById("members-list");
    const lastUpdatedElement = document.getElementById("last-updated");


    // Function to fetch and update members
    function fetchAndUpdateMembers() {
        fetch("http://localhost:5000/api/discord-members")
            .then(response => response.json())
            .then(data => {
                const members = data.members;
                localStorage.setItem("cachedMembers", JSON.stringify(members));
    
                updateUI(members);
    
                // Update last updated timestamp
                const now = new Date();
                lastUpdatedElement.textContent = `Last updated: ${now.toLocaleString()}`;
            })
            .catch(error => {
                console.error("[MEMBERS]: Error fetching Discord data:", error);
            });
    }
    

    // Function to update the UI
    function updateUI(members) {
        const statusCounts = { online: 0, offline: 0, idle: 0, dnd: 0 };

        members.forEach(member => {
            if (statusCounts[member.status] !== undefined) {
                statusCounts[member.status]++;
            }
        });

        onlineCountElement.textContent = statusCounts.online;
        offlineCountElement.textContent = statusCounts.offline;
        idleCountElement.textContent = statusCounts.idle;
        dndCountElement.textContent = statusCounts.dnd;
        totalMembersElement.textContent = members.length;

        const maxRolesToShow = 2;
        let tableHTML = members.map(member => {
            const displayedRoles = member.roles.slice(0, maxRolesToShow);
            const hiddenRoles = member.roles.slice(maxRolesToShow);

            let lastMessageTimestamp = member.lastMessage !== "No messages" ? new Date(member.lastMessage).getTime() : 0;
            let formattedLastMessage = lastMessageTimestamp ? new Date(lastMessageTimestamp).toLocaleString() : "No messages";

            return `
                <tr>
                    <td><img src="${member.avatar}" class="rounded-circle" width="40"></td>
                    <td>${member.username}</td>
                    <td>${member.status}</td>
                    <td>
                        <div class="d-flex flex-wrap gap-1">
                            ${displayedRoles.map(role => 
                                `<span class="badge rounded-pill p-1 px-2 text-white" style="background-color: ${role.color};">${role.name}</span>`
                            ).join(" ")}
                            ${hiddenRoles.length > 0 ? 
                                `<span class="badge rounded-pill p-1 px-2 text-white bg-secondary" title="${hiddenRoles.map(r => r.name).join(', ')}">+${hiddenRoles.length} More</span>` 
                                : ''
                            }
                        </div>
                    </td>
                    <td data-order="${lastMessageTimestamp}">
                        ${member.inactive ? '<span style="color: red; margin-right: 5px;" title="Inactive for 3+ months">⚠️</span>' : ''}
                        ${formattedLastMessage}
                    </td>
                </tr>
            `;
        }).join("");

        membersListElement.innerHTML = tableHTML;

        if ($.fn.DataTable.isDataTable("#members-table")) {
            $('#members-table').DataTable().destroy();
        }

        $("#members-table").DataTable({
            "paging": true,
            "searching": true,
            "ordering": true,
            "order": [[4, "asc"]],
            "columnDefs": [{ "type": "num", "targets": 4 }],
            "destroy": true
        });
    }

    // Load cached members initially to show data quickly
    let cachedMembers = JSON.parse(localStorage.getItem("cachedMembers"));
    if (cachedMembers) {
        updateUI(cachedMembers);
    }

    // Fetch and update members on page load
    fetchAndUpdateMembers();

    // Refresh every 10 minutes (600,000 milliseconds)
    setInterval(fetchAndUpdateMembers, 600000);
});
