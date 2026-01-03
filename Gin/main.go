package main

import (
	"context"
	"log"
	"net"
	"net/http"

	chesspb "gin-quickstart/chess/chess"

	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
)

type chessServer struct {
	chesspb.UnimplementedChessServiceServer
}

func main() {
	// Start gRPC server
	go func() {
		lis, err := net.Listen("tcp", ":50051")
		if err != nil {
			log.Fatalf("Failed to listen: %v", err)
		}

		grpcServer := grpc.NewServer()
		chesspb.RegisterChessServiceServer(grpcServer, &chessServer{})

		log.Println("gRPC Chess server running on :50051")
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("Failed to serve gRPC: %v", err)
		}
	}()

	r := gin.Default()
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	r.POST("/play-move", func(c *gin.Context) {
		var req chesspb.PlayMoveRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		grpcSrv := &chessServer{}
		resp, err := grpcSrv.PlayMove(context.Background(), &req)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, resp)
	})

	log.Println("HTTP server running on :8080")
	r.Run(":8080")
}
