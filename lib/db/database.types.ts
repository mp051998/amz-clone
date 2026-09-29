
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "addresses": {
                  Row: {
                    "city": string,"created_at": string,"full_name": string,"id": string,"is_default": boolean,"kind": string | null,"landmark": string | null,"line1": string,"line2": string | null,"market_id": string,"phone": string,"postcode": string,"state": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "city": string,"created_at"?: string,"full_name": string,"id"?: string,"is_default"?: boolean,"kind"?: string | null,"landmark"?: string | null,"line1": string,"line2"?: string | null,"market_id": string,"phone": string,"postcode": string,"state": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "city"?: string,"created_at"?: string,"full_name"?: string,"id"?: string,"is_default"?: boolean,"kind"?: string | null,"landmark"?: string | null,"line1"?: string,"line2"?: string | null,"market_id"?: string,"phone"?: string,"postcode"?: string,"state"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "addresses_market_id_fkey"
      columns: ["market_id"]
isOneToOne: false
      referencedRelation: "markets"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_cache": {
                  Row: {
                    "created_at": string,"expires_at": string,"feature": string,"key": string,"provider": string,"value": NonNullable<Json>
                  }
                  Insert: {
                    "created_at"?: string,"expires_at": string,"feature": string,"key": string,"provider": string,"value": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"feature"?: string,"key"?: string,"provider"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"cart_items": {
                  Row: {
                    "added_at": string,"cart_id": string,"product_id": string,"qty": number
                  }
                  Insert: {
                    "added_at"?: string,"cart_id": string,"product_id": string,"qty": number
                  }
                  Update: {
                    "added_at"?: string,"cart_id"?: string,"product_id"?: string,"qty"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "cart_items_cart_id_fkey"
      columns: ["cart_id"]
isOneToOne: false
      referencedRelation: "carts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cart_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "catalog_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cart_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"carts": {
                  Row: {
                    "created_at": string,"guest_token": string | null,"id": string,"market_id": string,"updated_at": string,"user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"guest_token"?: string | null,"id"?: string,"market_id": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"guest_token"?: string | null,"id"?: string,"market_id"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "carts_market_id_fkey"
      columns: ["market_id"]
isOneToOne: false
      referencedRelation: "markets"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "name": string,"slug": string
                  }
                  Insert: {
                    "name": string,"slug": string
                  }
                  Update: {
                    "name"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"collection_items": {
                  Row: {
                    "added_at": string,"collection_id": string,"product_id": string,"saved_price_minor": number
                  }
                  Insert: {
                    "added_at"?: string,"collection_id": string,"product_id": string,"saved_price_minor": number
                  }
                  Update: {
                    "added_at"?: string,"collection_id"?: string,"product_id"?: string,"saved_price_minor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "collection_items_collection_id_fkey"
      columns: ["collection_id"]
isOneToOne: false
      referencedRelation: "collections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collection_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "catalog_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collection_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"collections": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"market_id": string,"name": string,"note": string,"position": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"market_id": string,"name": string,"note"?: string,"position"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"market_id"?: string,"name"?: string,"note"?: string,"position"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "collections_market_id_fkey"
      columns: ["market_id"]
isOneToOne: false
      referencedRelation: "markets"
      referencedColumns: ["id"]
    }
                  ]
                },"market_categories": {
                  Row: {
                    "category_slug": string,"market_id": string,"position": number
                  }
                  Insert: {
                    "category_slug": string,"market_id": string,"position": number
                  }
                  Update: {
                    "category_slug"?: string,"market_id"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_categories_category_slug_fkey"
      columns: ["category_slug"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "market_categories_market_id_fkey"
      columns: ["market_id"]
isOneToOne: false
      referencedRelation: "markets"
      referencedColumns: ["id"]
    }
                  ]
                },"markets": {
                  Row: {
                    "currency": string,"free_ship_threshold_minor": number,"id": string,"max_line_qty": number,"payment_methods": (string)[],"ship_fee_minor": number,"tax_inclusive": boolean,"tax_rate_bps": number
                  }
                  Insert: {
                    "currency": string,"free_ship_threshold_minor": number,"id": string,"max_line_qty"?: number,"payment_methods": (string)[],"ship_fee_minor": number,"tax_inclusive": boolean,"tax_rate_bps"?: number
                  }
                  Update: {
                    "currency"?: string,"free_ship_threshold_minor"?: number,"id"?: string,"max_line_qty"?: number,"payment_methods"?: (string)[],"ship_fee_minor"?: number,"tax_inclusive"?: boolean,"tax_rate_bps"?: number
                  }
                  Relationships: [
                    
                  ]
                },"order_items": {
                  Row: {
                    "image": string,"line_no": number,"order_id": string,"product_id": string,"qty": number,"seller": string,"title": string,"unit_price_minor": number
                  }
                  Insert: {
                    "image": string,"line_no": number,"order_id": string,"product_id": string,"qty": number,"seller": string,"title": string,"unit_price_minor": number
                  }
                  Update: {
                    "image"?: string,"line_no"?: number,"order_id"?: string,"product_id"?: string,"qty"?: number,"seller"?: string,"title"?: string,"unit_price_minor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "catalog_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "cancelled_at": string | null,"created_at": string,"currency": string,"id": string,"market_id": string,"payment_label": string,"payment_method": string,"placed_at": string | null,"ship_city": string,"ship_landmark": string | null,"ship_line1": string,"ship_line2": string | null,"ship_minor": number,"ship_name": string,"ship_phone": string,"ship_postcode": string,"ship_state": string,"status": string,"stripe_session_id": string | null,"subtotal_minor": number,"tax_minor": number,"total_minor": number,"user_id": string
                  }
                  Insert: {
                    "cancelled_at"?: string | null,"created_at"?: string,"currency": string,"id": string,"market_id": string,"payment_label": string,"payment_method": string,"placed_at"?: string | null,"ship_city": string,"ship_landmark"?: string | null,"ship_line1": string,"ship_line2"?: string | null,"ship_minor": number,"ship_name": string,"ship_phone": string,"ship_postcode": string,"ship_state": string,"status": string,"stripe_session_id"?: string | null,"subtotal_minor": number,"tax_minor": number,"total_minor": number,"user_id": string
                  }
                  Update: {
                    "cancelled_at"?: string | null,"created_at"?: string,"currency"?: string,"id"?: string,"market_id"?: string,"payment_label"?: string,"payment_method"?: string,"placed_at"?: string | null,"ship_city"?: string,"ship_landmark"?: string | null,"ship_line1"?: string,"ship_line2"?: string | null,"ship_minor"?: number,"ship_name"?: string,"ship_phone"?: string,"ship_postcode"?: string,"ship_state"?: string,"status"?: string,"stripe_session_id"?: string | null,"subtotal_minor"?: number,"tax_minor"?: number,"total_minor"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_market_id_fkey"
      columns: ["market_id"]
isOneToOne: false
      referencedRelation: "markets"
      referencedColumns: ["id"]
    }
                  ]
                },"product_insights": {
                  Row: {
                    "best_for": string,"cons": (string)[],"criticized": NonNullable<Json>,"praised": NonNullable<Json>,"product_id": string,"pros": (string)[],"scores": NonNullable<Json>,"source": string,"summary": string,"updated_at": string
                  }
                  Insert: {
                    "best_for"?: string,"cons"?: (string)[],"criticized"?: NonNullable<Json>,"praised"?: NonNullable<Json>,"product_id": string,"pros"?: (string)[],"scores"?: NonNullable<Json>,"source"?: string,"summary"?: string,"updated_at"?: string
                  }
                  Update: {
                    "best_for"?: string,"cons"?: (string)[],"criticized"?: NonNullable<Json>,"praised"?: NonNullable<Json>,"product_id"?: string,"pros"?: (string)[],"scores"?: NonNullable<Json>,"source"?: string,"summary"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_insights_product_id_fkey"
      columns: ["product_id"]
isOneToOne: true
      referencedRelation: "catalog_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_insights_product_id_fkey"
      columns: ["product_id"]
isOneToOne: true
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_ratings": {
                  Row: {
                    "product_id": string,"rating_count": number,"rating_sum": number,"star_1": number,"star_2": number,"star_3": number,"star_4": number,"star_5": number
                  }
                  Insert: {
                    "product_id": string,"rating_count"?: number,"rating_sum"?: number,"star_1"?: number,"star_2"?: number,"star_3"?: number,"star_4"?: number,"star_5"?: number
                  }
                  Update: {
                    "product_id"?: string,"rating_count"?: number,"rating_sum"?: number,"star_1"?: number,"star_2"?: number,"star_3"?: number,"star_4"?: number,"star_5"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_ratings_product_id_fkey"
      columns: ["product_id"]
isOneToOne: true
      referencedRelation: "catalog_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_ratings_product_id_fkey"
      columns: ["product_id"]
isOneToOne: true
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "badge": string | null,"bought_past_month": string | null,"brand": string | null,"bullets": (string)[],"category_slug": string,"created_at": string,"deal": boolean,"deal_pct": number | null,"id": string,"image": string,"list_minor": number | null,"market_id": string,"position": number,"price_minor": number,"search_doc": unknown,"seller": string,"ships_from": string,"stock": number,"title": string,"updated_at": string
                  }
                  Insert: {
                    "badge"?: string | null,"bought_past_month"?: string | null,"brand"?: string | null,"bullets"?: (string)[],"category_slug": string,"created_at"?: string,"deal"?: boolean,"deal_pct"?: number | null,"id": string,"image": string,"list_minor"?: number | null,"market_id": string,"position": number,"price_minor": number,"search_doc"?: unknown,"seller": string,"ships_from": string,"stock"?: number,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "badge"?: string | null,"bought_past_month"?: string | null,"brand"?: string | null,"bullets"?: (string)[],"category_slug"?: string,"created_at"?: string,"deal"?: boolean,"deal_pct"?: number | null,"id"?: string,"image"?: string,"list_minor"?: number | null,"market_id"?: string,"position"?: number,"price_minor"?: number,"search_doc"?: unknown,"seller"?: string,"ships_from"?: string,"stock"?: number,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_category_slug_fkey"
      columns: ["category_slug"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "products_market_id_fkey"
      columns: ["market_id"]
isOneToOne: false
      referencedRelation: "markets"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"display_name": string,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"review_reports": {
                  Row: {
                    "created_at": string,"reason": string,"review_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"reason"?: string,"review_id": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"reason"?: string,"review_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_reports_review_id_fkey"
      columns: ["review_id"]
isOneToOne: false
      referencedRelation: "reviews"
      referencedColumns: ["id"]
    }
                  ]
                },"review_votes": {
                  Row: {
                    "created_at": string,"review_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"review_id": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"review_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_votes_review_id_fkey"
      columns: ["review_id"]
isOneToOne: false
      referencedRelation: "reviews"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "author_name": string,"body": string,"created_at": string,"helpful_count": number,"id": string,"product_id": string,"rating": number,"seeded": boolean,"title": string,"updated_at": string,"user_id": string | null,"verified": boolean
                  }
                  Insert: {
                    "author_name": string,"body": string,"created_at"?: string,"helpful_count"?: number,"id"?: string,"product_id": string,"rating": number,"seeded"?: boolean,"title": string,"updated_at"?: string,"user_id"?: string | null,"verified"?: boolean
                  }
                  Update: {
                    "author_name"?: string,"body"?: string,"created_at"?: string,"helpful_count"?: number,"id"?: string,"product_id"?: string,"rating"?: number,"seeded"?: boolean,"title"?: string,"updated_at"?: string,"user_id"?: string | null,"verified"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "catalog_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "catalog_products": {
                  Row: {
                    "badge": string | null,"badge_rank": number | null,"bought_past_month": string | null,"brand": string | null,"bullets": (string)[] | null,"category_name": string | null,"category_slug": string | null,"currency": string | null,"deal": boolean | null,"deal_pct": number | null,"id": string | null,"image": string | null,"list_minor": number | null,"market_id": string | null,"position": number | null,"price_minor": number | null,"rating": number | null,"review_count": number | null,"seller": string | null,"ships_from": string | null,"stock": number | null,"title": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_category_slug_fkey"
      columns: ["category_slug"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "products_market_id_fkey"
      columns: ["market_id"]
isOneToOne: false
      referencedRelation: "markets"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "attach_checkout_session":
{ Args: { "p_order_id": string,"p_session_id": string }; Returns: undefined
                           },
"cancel_pending_order":
{ Args: { "p_order_id": string }; Returns: Json
                           },
"cart_clear":
{ Args: { "p_guest_token"?: string,"p_market": string }; Returns: Json
                           },
"cart_get":
{ Args: { "p_guest_token"?: string,"p_market": string }; Returns: Json
                           },
"cart_merge_guest":
{ Args: { "p_guest_token": string }; Returns: number
                           },
"cart_set_qty":
{ Args: { "p_guest_token"?: string,"p_market": string,"p_mode"?: string,"p_product_id": string,"p_qty": number }; Returns: Json
                           },
"confirm_order_payment":
{ Args: { "p_amount_minor": number,"p_currency": string,"p_order_id": string,"p_payment_label": string,"p_session_id": string }; Returns: Json
                           },
"order_totals":
{ Args: { "p_market": string,"p_subtotal": number }; Returns: {
              "ship_minor": number,"subtotal_minor": number,"tax_minor": number,"total_minor": number
            }[]
                           },
"place_order":
{ Args: { "p_market": string,"p_payment_method": string,"p_shipping": Json }; Returns: Json
                           },
"purge_stale_guest_carts":
{ Args: { "p_older_than"?: string }; Returns: number
                           },
"release_checkout_session":
{ Args: { "p_session_id": string }; Returns: string
                           },
"search_catalog":
{ Args: { "p_brands"?: (string)[],"p_deal"?: boolean,"p_dept"?: string,"p_market": string,"p_min_rating"?: number,"p_page"?: number,"p_page_size"?: number,"p_q"?: string,"p_sort"?: string }; Returns: Json
                           },
"to_prefix_tsquery":
{ Args: { "p_text": string }; Returns: unknown
                           },
"toggle_review_helpful":
{ Args: { "p_review_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const

