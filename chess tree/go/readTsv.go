package main

import (
	"encoding/csv"
	"fmt"
	"os"
)

func main() {
	files := []string{
		"Opening/a.tsv",
		"Opening/b.tsv",
		"Opening/c.tsv",
		"Opening/d.tsv",
		"Opening/e.tsv",
	}

	var allRecords [][]string

	for _, fname := range files {
		file, err := os.Open(fname)
		if err != nil {
			fmt.Println("error while opening file", fname, err)
			continue
		}

		reader := csv.NewReader(file)
		reader.Comma = '\t'

		records, err := reader.ReadAll()
		file.Close()

		if err != nil {
			fmt.Println("error reading file", fname, err)
			continue
		}

		fmt.Printf("Loaded %d records from %s\n", len(records), fname)

		for i, record := range records {
			if i == 0 {
				continue
			}
			allRecords = append(allRecords, record)
		}
	}

	fmt.Printf("\nTotal records loaded: %d\n", len(allRecords))
}
