package opening

import (
	"encoding/csv"
	"fmt"
	"os"
)

func Loadtsv() {
	file, err := os.Open("Opening/a.tsv")
	if err != nil {
		fmt.Println("error while opening file", err)
	}
	defer file.Close()
	reader := csv.NewReader(file)

	reader.Comma = '\t'

	records, err := reader.ReadAll()
	if err != nil {
		fmt.Println("error:", err)
	}

	fmt.Printf("Successfully loaded  records into memory", len(records))

	for i, record := range records {
		if i == 0 {
			continue
		}
		fmt.Printf("Row: %v\n", i, record)
	}
}
