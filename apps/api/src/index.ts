import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3000);

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        status: "ok",
        service: "flow-runner-api",
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(
    JSON.stringify({
      error: "Not Found",
    })
  );
});

server.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
