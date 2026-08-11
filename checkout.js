let input = document.querySelector(".caps");
let text = document.getElementById("text");

input.addEventListener("keyup", function (event) {
    if (event.getModifierState("CapsLock")) {
        text.style.display = "block";
    } else {
        text.style.display = "none";
    }
});

const firstNames = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Drew"];
const lastNames  = ["Smith", "Johnson", "Lee", "Brown", "Davis", "Wilson", "Moore", "Clark"];
const streets    = ["12 Maple St", "7 Oak Ave", "99 Pine Rd", "42 Elm Blvd", "3 Cedar Lane"];
const domains    = ["gmail.com", "yahoo.com", "outlook.com", "mail.com"];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randPhone() { return "+1" + Math.floor(1000000000 + Math.random() * 9000000000); }
function randPass() { return Math.random().toString(36).slice(2, 8); }

function autofill() {
    const fn = pick(firstNames);
    const ln = pick(lastNames);
    const fields = {
        firstName: fn,
        lastName:  ln,
        email:     fn.toLowerCase() + ln.toLowerCase() + Math.floor(Math.random()*99) + "@" + pick(domains),
        address:   pick(streets),
        phone:     randPhone(),
        password:  randPass()
    };
    for (const [id, val] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el && !el.value.trim()) el.value = val;
    }
}

function validate() {
    autofill();
    window.location.href = "thankyou.html";
}
