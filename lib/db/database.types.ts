
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
                },"admins": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
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
                },"balance_entries": {
                  Row: {
                    "amount_minor": number,"created_at": string,"gift_card_code": string | null,"id": number,"kind": string,"market_id": string,"order_id": string | null,"return_id": string | null,"user_id": string
                  }
                  Insert: {
                    "amount_minor": number,"created_at"?: string,"gift_card_code"?: string | null,"id"?: never,"kind": string,"market_id": string,"order_id"?: string | null,"return_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "amount_minor"?: number,"created_at"?: string,"gift_card_code"?: string | null,"id"?: never,"kind"?: string,"market_id"?: string,"order_id"?: string | null,"return_id"?: string | null,"user_id"?: string
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
                },"coupons": {
                  Row: {
                    "created_at": string,"percent_off": number,"product_id": string
                  }
                  Insert: {
                    "created_at"?: string,"percent_off": number,"product_id": string
                  }
                  Update: {
                    "created_at"?: string,"percent_off"?: number,"product_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"coupon_clips": {
                  Row: {
                    "clipped_at": string,"product_id": string,"user_id": string
                  }
                  Insert: {
                    "clipped_at"?: string,"product_id": string,"user_id": string
                  }
                  Update: {
                    "clipped_at"?: string,"product_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"gift_cards": {
                  Row: {
                    "amount_minor": number,"code": string,"created_at": string,"issued_to": string | null,"market_id": string,"redeemed_at": string | null,"redeemed_by": string | null
                  }
                  Insert: {
                    "amount_minor": number,"code": string,"created_at"?: string,"issued_to"?: string | null,"market_id": string,"redeemed_at"?: string | null,"redeemed_by"?: string | null
                  }
                  Update: {
                    "amount_minor"?: number,"code"?: string,"created_at"?: string,"issued_to"?: string | null,"market_id"?: string,"redeemed_at"?: string | null,"redeemed_by"?: string | null
                  }
                  Relationships: [
                    
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
                    "currency": string,"demo_gift_card_minor": number,"fast_ship_fee_minor": number,"free_ship_threshold_minor": number,"id": string,"max_line_qty": number,"payment_methods": (string)[],"return_days": number,"ship_fee_minor": number,"tax_inclusive": boolean,"tax_rate_bps": number,"time_zone": string
                  }
                  Insert: {
                    "currency": string,"demo_gift_card_minor"?: number,"fast_ship_fee_minor"?: number,"free_ship_threshold_minor": number,"id": string,"max_line_qty"?: number,"payment_methods": (string)[],"return_days"?: number,"ship_fee_minor": number,"tax_inclusive": boolean,"tax_rate_bps"?: number,"time_zone"?: string
                  }
                  Update: {
                    "currency"?: string,"demo_gift_card_minor"?: number,"fast_ship_fee_minor"?: number,"free_ship_threshold_minor"?: number,"id"?: string,"max_line_qty"?: number,"payment_methods"?: (string)[],"return_days"?: number,"ship_fee_minor"?: number,"tax_inclusive"?: boolean,"tax_rate_bps"?: number,"time_zone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"order_items": {
                  Row: {
                    "image": string,"line_no": number,"order_id": string,"product_id": string,"qty": number,"seller": string,"title": string,"unit_discount_minor": number,"unit_price_minor": number
                  }
                  Insert: {
                    "image": string,"line_no": number,"order_id": string,"product_id": string,"qty": number,"seller": string,"title": string,"unit_discount_minor"?: number,"unit_price_minor": number
                  }
                  Update: {
                    "image"?: string,"line_no"?: number,"order_id"?: string,"product_id"?: string,"qty"?: number,"seller"?: string,"title"?: string,"unit_discount_minor"?: number,"unit_price_minor"?: number
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
                    "cancel_reason": string | null,"cancelled_at": string | null,"created_at": string,"currency": string,"discount_minor": number,"gift": boolean,"gift_message": string | null,"delivered_at": string | null,"id": string,"market_id": string,"out_for_delivery_at": string | null,"payment_label": string,"payment_method": string,"placed_at": string | null,"refund_minor": number | null,"refund_status": string | null,"refunded_at": string | null,"ship_city": string,"ship_landmark": string | null,"ship_line1": string,"ship_line2": string | null,"ship_minor": number,"ship_name": string,"ship_phone": string,"ship_postcode": string,"ship_speed": string,"ship_state": string,"shipped_at": string | null,"status": string,"stripe_payment_intent": string | null,"stripe_refund_id": string | null,"stripe_session_id": string | null,"subtotal_minor": number,"tax_minor": number,"total_minor": number,"user_id": string
                  }
                  Insert: {
                    "cancelled_at"?: string | null,"created_at"?: string,"currency": string,"discount_minor"?: number,"gift"?: boolean,"gift_message"?: string | null,"id": string,"market_id": string,"payment_label": string,"payment_method": string,"placed_at"?: string | null,"ship_city": string,"ship_landmark"?: string | null,"ship_line1": string,"ship_line2"?: string | null,"ship_minor": number,"ship_name": string,"ship_phone": string,"ship_postcode": string,"ship_speed"?: string,"ship_state": string,"status": string,"stripe_session_id"?: string | null,"subtotal_minor": number,"tax_minor": number,"total_minor": number,"user_id": string,"cancel_reason"?: string | null,"delivered_at"?: string | null,"out_for_delivery_at"?: string | null,"refund_minor"?: number | null,"refund_status"?: string | null,"refunded_at"?: string | null,"shipped_at"?: string | null,"stripe_payment_intent"?: string | null,"stripe_refund_id"?: string | null
                  }
                  Update: {
                    "cancelled_at"?: string | null,"created_at"?: string,"currency"?: string,"discount_minor"?: number,"gift"?: boolean,"gift_message"?: string | null,"id"?: string,"market_id"?: string,"payment_label"?: string,"payment_method"?: string,"placed_at"?: string | null,"ship_city"?: string,"ship_landmark"?: string | null,"ship_line1"?: string,"ship_line2"?: string | null,"ship_minor"?: number,"ship_name"?: string,"ship_phone"?: string,"ship_postcode"?: string,"ship_speed"?: string,"ship_state"?: string,"status"?: string,"stripe_session_id"?: string | null,"subtotal_minor"?: number,"tax_minor"?: number,"total_minor"?: number,"user_id"?: string,"cancel_reason"?: string | null,"delivered_at"?: string | null,"out_for_delivery_at"?: string | null,"refund_minor"?: number | null,"refund_status"?: string | null,"refunded_at"?: string | null,"shipped_at"?: string | null,"stripe_payment_intent"?: string | null,"stripe_refund_id"?: string | null
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
                },"answer_votes": {
                  Row: {
                    "answer_id": string,"created_at": string,"user_id": string
                  }
                  Insert: {
                    "answer_id": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "answer_id"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"product_answers": {
                  Row: {
                    "author_name": string,"body": string,"created_at": string,"helpful_count": number,"id": string,"question_id": string,"user_id": string | null,"verified": boolean
                  }
                  Insert: {
                    "author_name": string,"body": string,"created_at"?: string,"helpful_count"?: number,"id"?: string,"question_id": string,"user_id"?: string | null,"verified"?: boolean
                  }
                  Update: {
                    "author_name"?: string,"body"?: string,"created_at"?: string,"helpful_count"?: number,"id"?: string,"question_id"?: string,"user_id"?: string | null,"verified"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"product_questions": {
                  Row: {
                    "answer_count": number,"author_name": string,"body": string,"created_at": string,"id": string,"product_id": string,"user_id": string | null
                  }
                  Insert: {
                    "answer_count"?: number,"author_name": string,"body": string,"created_at"?: string,"id"?: string,"product_id": string,"user_id"?: string | null
                  }
                  Update: {
                    "answer_count"?: number,"author_name"?: string,"body"?: string,"created_at"?: string,"id"?: string,"product_id"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"products": {
                  Row: {
                    "archived_at": string | null,"badge": string | null,"bought_past_month": string | null,"brand": string | null,"bullets": (string)[],"category_slug": string,"created_at": string,"deal": boolean,"deal_pct": number | null,"description": string | null,"details": Json,"gallery": (string)[],"id": string,"image": string,"list_minor": number | null,"market_id": string,"position": number,"price_minor": number,"search_doc": unknown,"seller": string,"ships_from": string,"stock": number,"title": string,"updated_at": string,"variant_axis": string | null,"variant_group": string | null,"variant_label": string | null
                  }
                  Insert: {
                    "archived_at"?: string | null,"badge"?: string | null,"bought_past_month"?: string | null,"brand"?: string | null,"bullets"?: (string)[],"category_slug": string,"created_at"?: string,"deal"?: boolean,"deal_pct"?: number | null,"description"?: string | null,"details"?: Json,"gallery"?: (string)[],"id": string,"image": string,"list_minor"?: number | null,"market_id": string,"position": number,"price_minor": number,"search_doc"?: unknown,"seller": string,"ships_from": string,"stock"?: number,"title": string,"updated_at"?: string,"variant_axis"?: string | null,"variant_group"?: string | null,"variant_label"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"badge"?: string | null,"bought_past_month"?: string | null,"brand"?: string | null,"bullets"?: (string)[],"category_slug"?: string,"created_at"?: string,"deal"?: boolean,"deal_pct"?: number | null,"description"?: string | null,"details"?: Json,"gallery"?: (string)[],"id"?: string,"image"?: string,"list_minor"?: number | null,"market_id"?: string,"position"?: number,"price_minor"?: number,"search_doc"?: unknown,"seller"?: string,"ships_from"?: string,"stock"?: number,"title"?: string,"updated_at"?: string,"variant_axis"?: string | null,"variant_group"?: string | null,"variant_label"?: string | null
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
                },"plus_members": {
                  Row: {
                    "joined_at": string,"user_id": string
                  }
                  Insert: {
                    "joined_at"?: string,"user_id": string
                  }
                  Update: {
                    "joined_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
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
                },"return_items": {
                  Row: {
                    "order_id": string,"product_id": string,"qty": number,"return_id": string
                  }
                  Insert: {
                    "order_id": string,"product_id": string,"qty": number,"return_id": string
                  }
                  Update: {
                    "order_id"?: string,"product_id"?: string,"qty"?: number,"return_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "return_items_order_id_product_id_fkey"
      columns: ["order_id", "product_id"]
      isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["order_id", "product_id"]
    },{
      foreignKeyName: "return_items_return_id_fkey"
      columns: ["return_id"]
      isOneToOne: false
      referencedRelation: "returns"
      referencedColumns: ["id"]
    }
                  ]
                },"store_balances": {
                  Row: {
                    "balance_minor": number,"market_id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "balance_minor"?: number,"market_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "balance_minor"?: number,"market_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"returns": {
                  Row: {
                    "cancelled_at": string | null,"comment": string | null,"created_at": string,"dropoff_by": string,"dropoff_code": string,"id": string,"items_minor": number,"order_id": string,"reason": string,"received_at": string | null,"refund_minor": number,"refund_status": string | null,"refunded_at": string | null,"reject_note": string | null,"rejected_at": string | null,"ship_minor": number,"status": string,"stripe_refund_id": string | null,"tax_minor": number,"user_id": string
                  }
                  Insert: {
                    "cancelled_at"?: string | null,"comment"?: string | null,"created_at"?: string,"dropoff_by": string,"dropoff_code": string,"id"?: string,"items_minor": number,"order_id": string,"reason": string,"received_at"?: string | null,"refund_status"?: string | null,"refunded_at"?: string | null,"reject_note"?: string | null,"rejected_at"?: string | null,"ship_minor": number,"status"?: string,"stripe_refund_id"?: string | null,"tax_minor": number,"user_id": string
                  }
                  Update: {
                    "cancelled_at"?: string | null,"comment"?: string | null,"created_at"?: string,"dropoff_by"?: string,"dropoff_code"?: string,"id"?: string,"items_minor"?: number,"order_id"?: string,"reason"?: string,"received_at"?: string | null,"refund_status"?: string | null,"refunded_at"?: string | null,"reject_note"?: string | null,"rejected_at"?: string | null,"ship_minor"?: number,"status"?: string,"stripe_refund_id"?: string | null,"tax_minor"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "returns_order_id_fkey"
      columns: ["order_id"]
      isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
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
                    "author_name": string,"body": string,"created_at": string,"helpful_count": number,"hidden_at": string | null,"hidden_reason": string | null,"id": string,"moderated_at": string | null,"product_id": string,"rating": number,"seeded": boolean,"title": string,"updated_at": string,"user_id": string | null,"verified": boolean
                  }
                  Insert: {
                    "author_name": string,"body": string,"created_at"?: string,"helpful_count"?: number,"hidden_at"?: string | null,"hidden_reason"?: string | null,"id"?: string,"moderated_at"?: string | null,"product_id": string,"rating": number,"seeded"?: boolean,"title": string,"updated_at"?: string,"user_id"?: string | null,"verified"?: boolean
                  }
                  Update: {
                    "author_name"?: string,"body"?: string,"created_at"?: string,"helpful_count"?: number,"hidden_at"?: string | null,"hidden_reason"?: string | null,"id"?: string,"moderated_at"?: string | null,"product_id"?: string,"rating"?: number,"seeded"?: boolean,"title"?: string,"updated_at"?: string,"user_id"?: string | null,"verified"?: boolean
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
                    "badge": string | null,"badge_rank": number | null,"bought_past_month": string | null,"brand": string | null,"bullets": (string)[] | null,"category_name": string | null,"category_slug": string | null,"currency": string | null,"deal": boolean | null,"deal_pct": number | null,"id": string | null,"image": string | null,"list_minor": number | null,"market_id": string | null,"position": number | null,"price_minor": number | null,"rating": number | null,"review_count": number | null,"seller": string | null,"ships_from": string | null,"stock": number | null,"title": string | null,"variant_axis": string | null,"variant_group": string | null,"variant_label": string | null
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
                },
            "catalog_products_all": {
                  Row: {
                    "archived_at": string | null,"badge": string | null,"badge_rank": number | null,"bought_past_month": string | null,"brand": string | null,"bullets": (string)[] | null,"category_name": string | null,"category_slug": string | null,"currency": string | null,"deal": boolean | null,"deal_pct": number | null,"id": string | null,"image": string | null,"list_minor": number | null,"market_id": string | null,"position": number | null,"price_minor": number | null,"rating": number | null,"review_count": number | null,"seller": string | null,"ships_from": string | null,"stock": number | null,"title": string | null,"variant_axis": string | null,"variant_group": string | null,"variant_label": string | null
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
"admin_cancel_order":
{ Args: { "p_order_id": string }; Returns: Json
                           },
"admin_deliver_order":
{ Args: { "p_order_id": string }; Returns: Json
                           },
"admin_get_order":
{ Args: { "p_order_id": string }; Returns: Json
                           },
"admin_get_return":
{ Args: { "p_return_id": string }; Returns: Json
                           },
"admin_order_returns":
{ Args: { "p_order_id": string }; Returns: Json
                           },
"admin_list_orders":
{ Args: { "p_filter"?: string,"p_market": string,"p_page"?: number,"p_page_size"?: number,"p_q"?: string }; Returns: Json
                           },
"admin_list_returns":
{ Args: { "p_filter"?: string,"p_market": string,"p_page"?: number,"p_page_size"?: number }; Returns: Json
                           },
"admin_moderate_review":
{ Args: { "p_action": string,"p_review_id": string }; Returns: Json
                           },
"admin_receive_return":
{ Args: { "p_return_id": string }; Returns: Json
                           },
"admin_reject_return":
{ Args: { "p_note"?: string,"p_return_id": string }; Returns: Json
                           },
"admin_review_queue":
{ Args: { "p_market": string,"p_page"?: number,"p_page_size"?: number,"p_view"?: string }; Returns: Json
                           },
"admin_ship_order":
{ Args: { "p_order_id": string }; Returns: Json
                           },
            "attach_checkout_session":
{ Args: { "p_order_id": string,"p_session_id": string }; Returns: undefined
                           },
"bought_together":
{ Args: { "p_limit"?: number,"p_product_id": string }; Returns: Json
                           },
"cancel_my_order":
{ Args: { "p_order_id": string }; Returns: Json
                           },
"cancel_my_return":
{ Args: { "p_return_id": string }; Returns: Json
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
"category_counts":
{ Args: never; Returns: {
              "archived": number,"category_slug": string,"market_id": string,"products": number
            }[]
                           },
"clip_coupon":
{ Args: { "p_product": string }; Returns: Json
                           },
"claim_demo_gift_card":
{ Args: { "p_market": string }; Returns: Json
                           },
"confirm_order_payment":
{ Args: { "p_amount_minor": number,"p_currency": string,"p_order_id": string,"p_payment_label": string,"p_session_id": string }; Returns: Json
                           },
"email_in_use":
{ Args: { "p_email": string }; Returns: boolean
                           },
"is_admin":
{ Args: never; Returns: boolean
                           },
"join_plus":
{ Args: never; Returns: Json
                           },
"leave_plus":
{ Args: never; Returns: undefined
                           },
"mark_sold_out":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"move_category":
{ Args: { "p_market": string,"p_offset": number,"p_slug": string }; Returns: undefined
                           },
"order_totals":
{ Args: { "p_market": string,"p_subtotal": number }; Returns: {
              "ship_minor": number,"subtotal_minor": number,"tax_minor": number,"total_minor": number
            }[]
                           },
"place_order":
{ Args: { "p_gift"?: boolean,"p_gift_message"?: string,"p_market": string,"p_payment_method": string,"p_shipping": Json,"p_speed"?: string }; Returns: Json
                           },
"product_has_orders":
{ Args: { "p_product_id": string }; Returns: boolean
                           },
"order_returns":
{ Args: { "p_order_id": string }; Returns: Json
                           },
"purge_stale_guest_carts":
{ Args: { "p_older_than"?: string }; Returns: number
                           },
"record_payment_intent":
{ Args: { "p_order_id": string,"p_payment_intent": string }; Returns: undefined
                           },
"record_refund":
{ Args: { "p_order_id": string,"p_refund_id": string | null,"p_status": string }; Returns: undefined
                           },
"record_return_refund":
{ Args: { "p_refund_id": string | null,"p_return_id": string,"p_status": string }; Returns: undefined
                           },
"unclip_coupon":
{ Args: { "p_product": string }; Returns: undefined
                           },
"redeem_gift_card":
{ Args: { "p_code": string,"p_market": string }; Returns: Json
                           },
"release_checkout_session":
{ Args: { "p_session_id": string }; Returns: string
                           },
"request_return":
{ Args: { "p_comment"?: string,"p_items": Json,"p_order_id": string,"p_reason": string }; Returns: Json
                           },
"search_catalog":
{ Args: { "p_brands"?: (string)[],"p_deal"?: boolean,"p_dept"?: string,"p_market": string,"p_min_rating"?: number,"p_page"?: number,"p_page_size"?: number,"p_q"?: string,"p_sort"?: string }; Returns: Json
                           },
"search_suggest":
{ Args: { "p_market": string,"p_q": string }; Returns: Json
                           },
"to_prefix_tsquery":
{ Args: { "p_text": string }; Returns: unknown
                           },
"toggle_review_helpful":
{ Args: { "p_review_id": string }; Returns: Json
                           },
"ask_question":
{ Args: { "p_product": string,"p_body": string }; Returns: Json
                           },
"answer_question":
{ Args: { "p_question": string,"p_body": string }; Returns: Json
                           },
"delete_question":
{ Args: { "p_question": string }; Returns: undefined
                           },
"delete_answer":
{ Args: { "p_answer": string }; Returns: undefined
                           },
"toggle_answer_helpful":
{ Args: { "p_answer": string }; Returns: Json
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

