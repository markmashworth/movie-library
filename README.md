### Assumptions

* All JSON files in the Drive have values for all attributes (true for Drive's current state)
* A movie can span multiple genres (confirmed by duplicate movie entries in Drive)
* If movies share the same title, release year, and rating, then they reference the same movie. This logic will NOT apply to movies created via the API/ / UI (i.e. updating an existing movie with a new genre) as I think that would be a confusing user experience.
* All JSON files in the GDrive share the same schema:

```
{
    title: string,
    genre: string,
    year: integer,
    rating: number,
}
```
