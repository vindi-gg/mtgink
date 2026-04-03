const http = require("http");
const job = process.argv[2] || "sync";
const req = http.request(
  { hostname: "localhost", port: 8080, path: `/run?job=${job}`, method: "POST" },
  (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => console.log(data));
  }
);
req.end();
