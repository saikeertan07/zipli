--
-- PostgreSQL database dump
--

\restrict HunvPRtCnAtDMuDeNrUZlJIhTmcjrRbGc5CpUe5YWEkAyFwr4Gb5aPuxdukxNRR

-- Dumped from database version 18.6 (Homebrew)
-- Dumped by pg_dump version 18.6 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cart_items; Type: TABLE; Schema: public; Owner: tedlasaikeertan
--

CREATE TABLE public.cart_items (
    id integer NOT NULL,
    user_id integer NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cart_items_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE public.cart_items OWNER TO tedlasaikeertan;

--
-- Name: cart_items_id_seq; Type: SEQUENCE; Schema: public; Owner: tedlasaikeertan
--

CREATE SEQUENCE public.cart_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cart_items_id_seq OWNER TO tedlasaikeertan;

--
-- Name: cart_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tedlasaikeertan
--

ALTER SEQUENCE public.cart_items_id_seq OWNED BY public.cart_items.id;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: tedlasaikeertan
--

CREATE TABLE public.categories (
    id character varying(40) NOT NULL,
    name character varying(120) NOT NULL,
    emoji character varying(10) NOT NULL
);


ALTER TABLE public.categories OWNER TO tedlasaikeertan;

--
-- Name: order_items; Type: TABLE; Schema: public; Owner: tedlasaikeertan
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer NOT NULL,
    product_id integer,
    name character varying(160) NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    quantity integer NOT NULL,
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE public.order_items OWNER TO tedlasaikeertan;

--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: tedlasaikeertan
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_items_id_seq OWNER TO tedlasaikeertan;

--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tedlasaikeertan
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: tedlasaikeertan
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    user_id integer NOT NULL,
    item_total numeric(10,2) NOT NULL,
    delivery_fee numeric(10,2) DEFAULT 0 NOT NULL,
    grand_total numeric(10,2) NOT NULL,
    status character varying(20) DEFAULT 'placed'::character varying NOT NULL,
    delivery_address character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.orders OWNER TO tedlasaikeertan;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: tedlasaikeertan
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO tedlasaikeertan;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tedlasaikeertan
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: tedlasaikeertan
--

CREATE TABLE public.products (
    id integer NOT NULL,
    name character varying(160) NOT NULL,
    qty_label character varying(40) NOT NULL,
    price numeric(10,2) NOT NULL,
    mrp numeric(10,2) NOT NULL,
    emoji character varying(10),
    category_id character varying(40) NOT NULL,
    badge character varying(20),
    image_url character varying(255) DEFAULT '/images/placeholder.jpg'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT products_mrp_check CHECK ((mrp >= (0)::numeric)),
    CONSTRAINT products_price_check CHECK ((price >= (0)::numeric))
);


ALTER TABLE public.products OWNER TO tedlasaikeertan;

--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: tedlasaikeertan
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.products_id_seq OWNER TO tedlasaikeertan;

--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tedlasaikeertan
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: tedlasaikeertan
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name character varying(120) NOT NULL,
    email character varying(160) NOT NULL,
    password_hash character varying(200) NOT NULL,
    phone character varying(20),
    address character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO tedlasaikeertan;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: tedlasaikeertan
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO tedlasaikeertan;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tedlasaikeertan
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: cart_items id; Type: DEFAULT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.cart_items ALTER COLUMN id SET DEFAULT nextval('public.cart_items_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: cart_items; Type: TABLE DATA; Schema: public; Owner: tedlasaikeertan
--

COPY public.cart_items (id, user_id, product_id, quantity, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: tedlasaikeertan
--

COPY public.categories (id, name, emoji) FROM stdin;
all	All	🏠
dairy	Dairy, Bread & Eggs	🥛
fruits	Fruits & Vegetables	🍎
drinks	Cold Drinks & Juices	🥤
snacks	Snacks & Munchies	🍿
breakfast	Breakfast & Instant Food	🥣
sweet	Sweet Tooth	🍫
bakery	Bakery & Biscuits	🍪
tea	Tea, Coffee & Milk Drinks	☕
staples	Atta, Rice & Dal	🌾
masala	Masala, Oil & More	🌶️
sauces	Sauces & Spreads	🫙
meat	Chicken, Meat & Fish	🍗
organic	Organic & Healthy Living	🥦
baby	Baby Care	👶
pharma	Pharma & Wellness	💊
cleaning	Cleaning Essentials	🧹
personal	Personal Care	🧴
pet	Pet Care	🐾
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: tedlasaikeertan
--

COPY public.order_items (id, order_id, product_id, name, unit_price, quantity) FROM stdin;
1	1	7	Britannia Bread	45.00	1
2	1	8	Amul Fresh Cream	36.00	1
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: tedlasaikeertan
--

COPY public.orders (id, user_id, item_total, delivery_fee, grand_total, status, delivery_address, created_at) FROM stdin;
1	2	81.00	2.00	83.00	placed	\N	2026-08-18 08:24:29.15637+05:30
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: tedlasaikeertan
--

COPY public.products (id, name, qty_label, price, mrp, emoji, category_id, badge, image_url, created_at) FROM stdin;
8	Amul Fresh Cream	200 ml	36.00	38.00	🥛	dairy	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
9	Tomatoes	500 g	29.00	39.00	🍅	fruits	fresh	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
10	Onions	1 kg	35.00	45.00	🧅	fruits	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
11	Banana Cavendish	6 pcs	45.00	55.00	🍌	fruits	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
12	Apple Shimla	4 pcs	129.00	149.00	🍎	fruits	fresh	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
13	Spinach (Palak)	250 g	18.00	25.00	🥬	fruits	fresh	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
14	Carrot	500 g	32.00	40.00	🥕	fruits	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
15	Green Capsicum	250 g	22.00	30.00	🫑	fruits	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
16	Potato	1 kg	28.00	35.00	🥔	fruits	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
17	Watermelon	~2 kg	79.00	99.00	🍉	fruits	sale	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
18	Coriander (Dhaniya)	100 g	12.00	15.00	🌿	fruits	fresh	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
19	Coca-Cola	750 ml	45.00	50.00	🥤	drinks	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
20	Pepsi	750 ml	42.00	48.00	🥤	drinks	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
21	Sprite	750 ml	42.00	48.00	🫧	drinks	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
22	Real Fruit Juice Orange	1 L	110.00	130.00	🧃	drinks	sale	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
23	Bisleri Mineral Water	1 L	20.00	20.00	💧	drinks	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
24	Red Bull Energy Drink	250 ml	125.00	130.00	⚡	drinks	hot	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
25	Maaza Mango Drink	600 ml	35.00	40.00	🥭	drinks	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
26	Lay's Classic Salted	52 g	20.00	20.00	🥔	snacks	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
27	Lay's Magic Masala	52 g	20.00	20.00	🔶	snacks	hot	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
28	Kurkure Masala Munch	90 g	25.00	30.00	🌽	snacks	hot	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
29	Haldiram's Bhujia	200 g	75.00	80.00	🌾	snacks	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
30	Uncle Chipps Spicy Treat	53 g	20.00	20.00	🥔	snacks	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
31	Maggi Masala Noodles	70 g	14.00	14.00	🍜	breakfast	hot	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
32	Kellogg's Corn Flakes	250 g	110.00	130.00	🥣	breakfast	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
33	Quaker Oats	500 g	120.00	140.00	🌾	breakfast	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
34	Sunfeast Yippee Noodles	70 g	12.00	14.00	🍜	breakfast	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
35	MTR Upma Mix	200 g	45.00	55.00	🍚	breakfast	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
36	Cadbury Dairy Milk	38 g	20.00	20.00	🍫	sweet	hot	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
37	Dairy Milk Silk	60 g	85.00	95.00	🍫	sweet	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
38	KitKat	37 g	30.00	35.00	🍫	sweet	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
39	5 Star	40 g	20.00	20.00	⭐	sweet	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
40	Britannia Good Day	120 g	20.00	20.00	🍪	bakery	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
41	Oreo Original Cookies	120 g	55.00	60.00	🍪	bakery	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
42	Parle-G Biscuits	250 g	15.00	15.00	🍪	bakery	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
43	Monaco Salty Biscuits	200 g	30.00	35.00	🥐	bakery	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
44	Tata Tea Premium	250 g	130.00	145.00	🍵	tea	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
45	Nescafé Classic Coffee	100 g	210.00	240.00	☕	tea	sale	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
46	Bournvita Health Drink	500 g	245.00	280.00	🥛	tea	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
47	Horlicks Classic Malt	500 g	235.00	270.00	🥛	tea	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
48	Aashirvaad Atta	5 kg	275.00	310.00	🌾	staples	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
49	India Gate Basmati Rice	1 kg	99.00	120.00	🍚	staples	sale	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
50	Tata Sampann Toor Dal	1 kg	145.00	165.00	🫘	staples	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
51	Tata Sampann Chana Dal	500 g	72.00	85.00	🫘	staples	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
52	Fortune Sunflower Oil	1 L	140.00	165.00	🫙	masala	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
53	MDH Garam Masala	100 g	75.00	90.00	🌶️	masala	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
54	Everest Chilli Powder	100 g	55.00	65.00	🌶️	masala	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
55	Kissan Mixed Fruit Jam	500 g	135.00	155.00	🍓	sauces	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
56	Maggi Tomato Ketchup	900 g	150.00	175.00	🍅	sauces	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
57	Nutella	180 g	269.00	310.00	🍫	sauces	hot	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
58	Amul Peanut Butter	300 g	149.00	175.00	🥜	sauces	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
59	Chicken Breast Boneless	500 g	179.00	210.00	🍗	meat	fresh	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
60	Country Delight Brown Eggs	6 pcs	58.00	65.00	🥚	meat	fresh	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
61	Rohu Fish Curry Cut	500 g	149.00	180.00	🐟	meat	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
62	Dabur Honey	250 g	175.00	200.00	🍯	organic	fresh	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
63	Saffola Gold Oil	1 L	200.00	230.00	🌻	organic	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
2	Amul Gold Full Cream Milk	1 L	69.00	69.00	🥛	dairy	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
3	Amul Butter	100 g	56.00	57.00	🧈	dairy	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
4	Country Delight White Eggs	6 pcs	42.00	48.00	🥚	dairy	hot	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
5	Amul Masti Dahi	400 g	38.00	40.00	🥛	dairy	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
6	Amul Malai Paneer	200 g	72.00	85.00	🧀	dairy	fresh	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
7	Britannia Bread	400 g	45.00	50.00	🍞	dairy	fresh	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
64	Pampers Pants (S)	40 pcs	549.00	640.00	🍼	baby	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
65	Johnson's Baby Powder	200 g	155.00	175.00	👶	baby	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
66	Dettol Antiseptic Liquid	50 ml	55.00	65.00	💊	pharma	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
67	Vicks VapoRub	25 g	55.00	65.00	💊	pharma	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
68	Surf Excel Easy Wash	1 kg	185.00	220.00	🧺	cleaning	sale	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
69	Harpic Toilet Cleaner	500 ml	95.00	115.00	🚿	cleaning	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
70	Vim Dishwash Bar	200 g	25.00	28.00	🧹	cleaning	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
71	Dove Moisturising Bar	100 g	45.00	55.00	🧼	personal	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
72	Colgate MaxFresh	150 g	89.00	100.00	🪥	personal	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
73	Head & Shoulders	180 ml	189.00	220.00	🧴	personal	sale	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
74	Pedigree Adult Dog Food	400 g	115.00	135.00	🐕	pet	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
75	Whiskas Cat Food	85 g	45.00	55.00	🐱	pet	\N	/images/placeholder.jpg	2026-08-18 08:05:31.91873+05:30
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: tedlasaikeertan
--

COPY public.users (id, name, email, password_hash, phone, address, created_at) FROM stdin;
1	saikeertan	tskkeerthan007@gmail.com	$2a$10$/UO4yv3DX8/FjoY1hvivDekdd61QytDa8w16LEUoCSWt.MEjeNLwq	\N	\N	2026-08-18 08:22:33.101831+05:30
2	abcdef	abcdef@gmail.com	$2a$10$4Z/.b4Fx.6XZc.YBkItM.u2ghakaguzpo.0fm8Sz2l/CbbKeYnzLS	\N	\N	2026-08-18 08:23:31.386919+05:30
3	asdf	asdf@gmail.com	$2a$10$t4XOc1sC1zwYrhxVitV9mucQLxM4c128lmsba6rItfNE.R4eZ4mDG	\N	\N	2026-08-19 12:04:22.399482+05:30
\.


--
-- Name: cart_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tedlasaikeertan
--

SELECT pg_catalog.setval('public.cart_items_id_seq', 2, true);


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tedlasaikeertan
--

SELECT pg_catalog.setval('public.order_items_id_seq', 2, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tedlasaikeertan
--

SELECT pg_catalog.setval('public.orders_id_seq', 1, true);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tedlasaikeertan
--

SELECT pg_catalog.setval('public.products_id_seq', 75, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tedlasaikeertan
--

SELECT pg_catalog.setval('public.users_id_seq', 3, true);


--
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);


--
-- Name: cart_items cart_items_user_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_user_id_product_id_key UNIQUE (user_id, product_id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: tedlasaikeertan
--

CREATE INDEX idx_products_category ON public.products USING btree (category_id);


--
-- Name: idx_products_name; Type: INDEX; Schema: public; Owner: tedlasaikeertan
--

CREATE INDEX idx_products_name ON public.products USING btree (lower((name)::text));


--
-- Name: cart_items cart_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tedlasaikeertan
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT ALL ON SCHEMA public TO zipli_user;


--
-- Name: TABLE cart_items; Type: ACL; Schema: public; Owner: tedlasaikeertan
--

GRANT ALL ON TABLE public.cart_items TO zipli_user;


--
-- Name: SEQUENCE cart_items_id_seq; Type: ACL; Schema: public; Owner: tedlasaikeertan
--

GRANT ALL ON SEQUENCE public.cart_items_id_seq TO zipli_user;


--
-- Name: TABLE categories; Type: ACL; Schema: public; Owner: tedlasaikeertan
--

GRANT ALL ON TABLE public.categories TO zipli_user;


--
-- Name: TABLE order_items; Type: ACL; Schema: public; Owner: tedlasaikeertan
--

GRANT ALL ON TABLE public.order_items TO zipli_user;


--
-- Name: SEQUENCE order_items_id_seq; Type: ACL; Schema: public; Owner: tedlasaikeertan
--

GRANT ALL ON SEQUENCE public.order_items_id_seq TO zipli_user;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: tedlasaikeertan
--

GRANT ALL ON TABLE public.orders TO zipli_user;


--
-- Name: SEQUENCE orders_id_seq; Type: ACL; Schema: public; Owner: tedlasaikeertan
--

GRANT ALL ON SEQUENCE public.orders_id_seq TO zipli_user;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: tedlasaikeertan
--

GRANT ALL ON TABLE public.products TO zipli_user;


--
-- Name: SEQUENCE products_id_seq; Type: ACL; Schema: public; Owner: tedlasaikeertan
--

GRANT ALL ON SEQUENCE public.products_id_seq TO zipli_user;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: tedlasaikeertan
--

GRANT ALL ON TABLE public.users TO zipli_user;


--
-- Name: SEQUENCE users_id_seq; Type: ACL; Schema: public; Owner: tedlasaikeertan
--

GRANT ALL ON SEQUENCE public.users_id_seq TO zipli_user;


--
-- PostgreSQL database dump complete
--

\unrestrict HunvPRtCnAtDMuDeNrUZlJIhTmcjrRbGc5CpUe5YWEkAyFwr4Gb5aPuxdukxNRR

