package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/helmet"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/monitor"
	recovermw "github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/websocket/v2"
)

type Client struct {
	Conn     *websocket.Conn
	ClientID string
	Send     chan []byte // channel to send messages to this client
}

type Message struct {
	Event    string      `json:"event"`
	ClientID string      `json:"clientId,omitempty"`
	Data     interface{} `json:"data,omitempty"`
}

var clients = make(map[string]*Client)

func main() {
	app := fiber.New()

	app.Use(logger.New())
	app.Use(helmet.New())
	app.Use(recovermw.New()) //  use alias, not the built-in recover()

	app.Use(cors.New(cors.Config{
		AllowOrigins: "http://localhost:8000, https://gofiber.net",
		AllowHeaders: "Origin, Content-Type, Accept",
	}))

	app.Use(limiter.New(limiter.Config{
		Max:        10,
		Expiration: 30 * time.Second,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.SendString("Rate limit exceeded")
		},
	}))

	app.Get("/", func(c *fiber.Ctx) error {
		return c.SendString("Hello from Fiber WS Chat Server")
	})
	app.Get("/metrics", monitor.New(monitor.Config{Title: "MyService Metrics Page"}))

	app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		var currentClient *Client
		done := make(chan struct{})

		//  Reader Goroutine
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Println("Recovered in reader:", r)
				}
				done <- struct{}{}
			}()

			for {
				_, msgBytes, err := c.ReadMessage()
				if err != nil {
					log.Println("client disconnected:", err)
					return
				}

				var msg Message
				if err := json.Unmarshal(msgBytes, &msg); err != nil {
					log.Println("Invalid message, skipping:", string(msgBytes))
					continue
				}

				switch msg.Event {
				case "handshake":
					currentClient = &Client{
						Conn:     c,
						ClientID: msg.ClientID,
						Send:     make(chan []byte, 10),
					}
					clients[msg.ClientID] = currentClient
					log.Printf("Handshake received: %s\n", msg.ClientID)

					go func(client *Client) {
						defer func() {
							if r := recover(); r != nil {
								log.Println("Recovered in writer:", r)
							}
							log.Printf("Writer for %s closed\n", client.ClientID)
						}()

						for msg := range client.Send {
							if err := client.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
								log.Println("write error:", err)
								break
							}
						}
					}(currentClient)

				case "message", "move":
					if currentClient == nil {
						log.Println("Message received before handshake, ignoring")
						continue
					}
					log.Printf("Event '%s' from %s: %s\n", msg.Event, currentClient.ClientID, msg.Data)

					outMsg := Message{
						Event: msg.Event,
						Data:  msg.Data,
					}
					outBytes, _ := json.Marshal(outMsg)

					for id, cl := range clients {
						if id == currentClient.ClientID {
							continue
						}
						select {
						case cl.Send <- outBytes:
						default:
							log.Printf("Client %s send buffer full, skipping\n", id)
						}
					}

				case "test":
					if currentClient == nil {
						log.Println("rejected init handshake first")
						continue
					}
					log.Println("here is payload", msg.Data, msg.Event, msg.ClientID)
				case "group_message":
					if currentClient == nil {
						log.Println("connection rejected")
						continue
					}
					log.Println("received message from", msg.ClientID, "on:", msg.Event, "data:", msg.Data)

					type MesRes struct {
						Sender  string      `json:"sender"`
						Time    time.Time   `json:"time"`
						Message interface{} `json:"message"`
					}

					data := MesRes{
						Sender:  msg.ClientID,
						Time:    time.Now(),
						Message: msg.Data,
					}

					outMsg := Message{
						Event: "receive_group_message",
						Data:  data,
					}
					outBytes, _ := json.Marshal(outMsg)

					for id, cl := range clients {
						if id == currentClient.ClientID {
							continue
						}
						select {
						case cl.Send <- outBytes:
						default:
							log.Printf("Client %s send buffer full, skipping\n", id)
						}
					}

				default:
					log.Println("Unknown event:", msg.Event)
				}
			}
		}()

		// Wait for reader goroutine to exit
		<-done

		//  Cleanup
		if currentClient != nil {
			delete(clients, currentClient.ClientID)
			close(currentClient.Send)
			log.Printf("Removed client %s\n", currentClient.ClientID)
		}
	}))

	fmt.Println(" Server running on http://localhost:8080")
	if err := app.Listen(":8080"); err != nil {
		fmt.Println(" Failed to start server:", err)
	}
}
